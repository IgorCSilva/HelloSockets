# First steps with Phoenix Channel

The client will subscribe to topic in server. After that the bidirectional messages can occurs.
One of the benefits of Channels is that they are transport agnostic.
The module that uses Phoenix.Socket has the ability to route topics that the client requests to a provided Phoenix.Channel implementation module. The Channel modue starts up a separate process for each different topic that the user connects to. Channels, like transport processes, are never shared between different connections.
Phoenix.PubSub is used to route messages to and from Channels.

Channels responsabilities:
- Accpet or reject a request to join;
- Handle messages from the client.
- Handle messages from the PubSub.
- Push messages to the client.

Defining a route to a channel:
- Comment any other channel in this file.
- In `user_socket.ex` file add channel "ping", HelloSocketsWeb.PingChannel

Implementing the channel:
- Create file `ping_channel.ex` in channels folder.
- Add the code below:
```elixir
defmodule HelloSocketsWeb.PingChannel do
  use Phoenix.Channel

  def join(_topic, _payload, socket) do
    {:ok, socket}
  end
end
```

Create also a ping event handler in the same file:
```elixir
  def handle_in("ping", _payload, socket) do
    {:reply, {:ok, %{ping: "pong"}}, socket}
  end
```

We are able to do several things when we receive a message:
- Reply to the message by returning {:replay, {:ok, map()}, Phoenix.Socket}. The payload must be a map.
- Do not reply to the message by returning {:noreply, Phoenix.Socket}.
- Disconnect the Channel by returning {:stop, reason, Phoenix}.

Now, install the wscat to send message to server from terminal.
`sudo apt install node-ws`

Execute the following command:
`wscat -c 'ws://localhost:4000/socket/websocket?vsn=2.0.0'`

After connected, send message to server:
> ["1", "1", "ping", "phx_join", {}]
> ["1", "2", "ping", "ping", {}]

and we will see something like:
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
> ["1", "2", "ping", "ping", {}]
< ["1","2","ping","phx_reply",{"response":{"ping":"pong"},"status":"ok"}]

We first use the special message "phx_join" to connect to the ping Channel using our WebSocket connection. We receive an ok response after the join. We then send the ping Channel a "ping" message with an empty payload. It successfully responds with a pong message.

If we get an error, we need rejoing the channel to work again:
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
> ["1", "2", "ping", "ping2", {}]
< ["1","1","ping","phx_error",{}]
> ["1", "2", "ping", "ping", {}]
< [null,"2","ping","phx_reply",{"response":{"reason":"unmatched topic"},"status":"error"}]
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
> ["1", "2", "ping", "ping", {}]
< ["1","2","ping","phx_reply",{"response":{"ping":"pong"},"status":"ok"}]

Note that the connection keep alive.

An error that happens in a single Channel should not affect any other Channels and should not affect the Socket. An error that happens in the Socket, however, will affect all Channels that exist under the Socket because they are dependent on the Socket working correctly.

To simulate an socket error, we can send a wrong message.
> crash
Disconnected (code: 1011, reason: "")

Now, the connection doesn't keep alive.

### Topics

Topics are string identifiers used for connecting to the correct Channel when the "phx_join" message is received by the Socket.

Test effect of topic pattern adding new channel in user_socket file:
`channel "ping:*", HelloSocketsWeb.PingChannel`

Now, connect to a "ping:wild" topic and send messages to it:
`wscat -c 'ws://localhost:4000/socket/websocket?vsn=2.0.0'`
> ["1", "1", "ping:wild", "phx_join", {}]
< ["1","1","ping:wild","phx_reply",{"response":{},"status":"ok"}]
> ["1", "1", "ping:wild", "ping", {}]
< ["1","1","ping:wild","phx_reply",{"response":{"ping":"pong"},"status":"ok"}]

We can put the topic "*" to catch any topic.
Phoenix has a protection to prevent topic creation with any character after, like "ping:*a".
`(ArgumentError) channels using splat patterns must end with *`

Let's create a topic that allows "wild:a:b" where b is an integer that is double the value of a:
- in user_socket.ex add: `channel "wild:*" HelloSocketsWeb.WildcardChannel`;
- create channel:
```elixir
defmodule HelloSocketsWeb.WildcardChannel do
  use Phoenix.Channel

  def join("wild:" <> numbers, _payload, socket) do
    if numbers_correct?(numbers) do
      {:ok, socket}
    else
      {:error, %{}}
    end
  end

  def handle_in("ping", _payload, socket) do
    {:reply, {:ok, %{ping: "pong"}}, socket}
  end

  defp numbers_correct?(numbers) do
    numbers
    |> String.split(":")
    |> Enum.map(&String.to_integer/1)
    |> case do
      [a, b] when b == a * 2 -> true
      _ -> false
    end
  end
end
```

Try it:
`wscat -c 'ws://localhost:4000/socket/websocket?vsn=2.0.0'`
> ["1", "1", "wild:1:2", "phx_join", {}]
< ["1","1","wild:1:2","phx_reply",{"response":{},"status":"ok"}]
> ["1", "2", "wild:1:2", "ping", {}]
< ["1","2","wild:1:2","phx_reply",{"response":{"ping":"pong"},"status":"ok"}]
> ["1", "3", "wild:1:3", "phx_join", {}]
< ["1","3","wild:1:3","phx_reply",{"response":{},"status":"error"}]
> ["1", "4", "wild:20:40", "phx_join", {}]
< ["1","4","wild:20:40","phx_reply",{"response":{},"status":"ok"}]
> ["1", "5", "wild:2:4:6", "phx_join", {}]
< ["1","5","wild:2:4:6","phx_reply",{"response":{},"status":"error"}]


We can define some topic like "notifications:t-1:u-2" to send notifications to user 2 in team 1.

A public Channel providing inventory updates to an e-commerce storefront could be implemented in a variety of ways:
- "inventory" - this topic does not delineate between different SKUs;
- "inventory:*" - this topic delineates between different item SKUs with a wildcard.

### PubSub
Let's see a PubSub example, used to push messages from our application to our Channel.

Execute:
`iex -S mix phx.server`

then, join the channel:
`wscat -c 'ws://localhost:4000/socket/websocket?vsn=2.0.0'`
> ["1", "1", "ping", "phx_join", {}]

in terminal, execute:
```bash
iex(2)> HelloSocketsWeb.Endpoint.broadcast("ping", "test", %{data: "test"})
:ok
iex(3)> HelloSocketsWeb.Endpoint.broadcast("other", "x", %{})
:ok
```

We will see in client terminal the message sent to ping topic, but won't see the other.
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
< [null,null,"ping","test",{"data":"test"}]

### Send and Receive messages
In this format(["1", "1", "ping", "phx_join", {}]), we have respectively:
- Join ref
- Message ref
- topic
- event
- payload

Let's return different values to the client. First, add function in ping_channel.ex file:
```elixir
def handle_in("ping", %{"ack_phrase" => ack_phrase}, socket) do
  {:reply, {:ok, %{ping: ack_phrase}}, socket}
end
```

Now, we can test it:
`wscat -c 'ws://localhost:4000/socket/websocket?vsn=2.0.0'`
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
> ["1", "2", "ping", "ping", {"ack_phrase": "hoorays..!"}]
< ["1","2","ping","phx_reply",{"response":{"ping":"hoorays..!"},"status":"ok"}]
> ["1", "2", "ping", "ping", {}]
< ["1","2","ping","phx_reply",{"response":{"ping":"pong"},"status":"ok"}]


Now, let's use pattern matching on the event name:
- change code to:
```elixir
def handle_in("ping:" <> phrase, _payload, socket) do
  {:reply, {:ok, %{ping: phrase}}, socket}
end
```

Try it:
`wscat -c 'ws://localhost:4000/socket/websocket?vsn=2.0.0'`
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
> ["1", "2", "ping", "ping:flows shows", {}]
< ["1","2","ping","phx_reply",{"response":{"ping":"flows shows"},"status":"ok"}]


### Other Response Types
Add following code in ping_channel.ex file:
```elixir
  def handle_in("pong", _payload, socket) do
    {:noreply, socket}
  end
  
  def handle_in("ding", _payload, socket) do
    # We can use :nomal or :shutdown.
    {:stop, :shutdown, {:ok, %{msg: "shutting down"}}, socket}
  end
```

Try it:
`wscat -c 'ws://localhost:4000/socket/websocket?vsn=2.0.0'`
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
> ["1", "2", "ping", "pong", {}]
> ["1", "2", "ping", "ding", {}]
< ["1","2","ping","phx_reply",{"response":{"msg":"shutting down"},"status":"ok"}]
< ["1","1","ping","phx_close",{}]


### Pushing messages to a client
This is the default behavior of Channels: any message sent to their topic is broadcast directly to the connected client, BUT we can customize this behavior, however, by intercepting any outgoing messages and deciding how to handle them.

Lets intercept an outgoing ping request. Add the following code in ping_channel.ex file:
```elixir
  def handle_out("request_ping", payload, socket) do
    # Send message to the client without client send a message first.
    push(socket, "send_ping", Map.put(payload, "from_node", Node.self()))
    {:noreply, socket}
  end
```

Stop the server and run:
`iex -S mix phx.server`

We will see the log below:
`lib/hello_sockets_web/channels/ping_channel.ex:24: [warning] An intercept for event "request_ping" has not yet been defined in Elixir.HelloSocketsWeb.PingChannel.handle_out/3. Add "request_ping" to your list of intercepted events with intercept/1`

It occurs because we need specify that the event "request_ping" must be intercepted.
Add the code in ping_channel.ex file:
`intercept ["request_ping"]`

Stop the server and run:
`iex -S mix phx.server`

Join the channel:
`wscat -c 'ws://localhost:4000/socket/websocket?vsn=2.0.0'`
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]


Run the broadcast:
```bash
iex(2)> HelloSocketsWeb.Endpoint.broadcast("ping", "request_ping", %{})
:ok
```

then, the client receive the message:
< ["1",null,"ping","send_ping",{"from_node":"nonode@nohost"}]

It is bes practice to not write an intercepted event if you do not need to customize the payload because it will decrease performance in a system with a lot of subscribers.

### Channel Clients
Responsabilities of channel clients:
- Connect to the server and maintain the connection by using a heartbeat.
- Join the requested topics.
- Push messages to a topic and optionally handle responses.
- Receive messages from a topic.
- Handle disconnection and other errors gracefully; try to maintain a connection whenever possible.

Let's send message with the javascript client.
Update user_socket.j file to this:
```js
import {Socket} from "phoenix"

let socket = new Socket("/socket", {})
socket.connect()

// Connecto to topic ping.
let channel = socket.channel("ping", {})
channel.join()
  .receive("ok", resp => { console.log("Joined ping", resp) })
  .receive("error", resp => { console.log("Unable to join ping", resp) })

export default socket

```

We initialize our Socket with the URL that is present in outr Endpoint module (/socket).
We invoke socket.channel function once per topic we want to connect to. The javascript client will prevent us from connecting to the same topic multiple times on one Socket connection, which prevents duplicate messages.

Start application:
`iex -S mix phx.server`

then access link:
`http://localhost:4000`

You will see the message in console tab:
`Joined ping`

Now, add code at the bottom in user_socket.js to send message to server:
```js
// Sending message.
console.log("send ping")
channel
  .push("ping")
  .receive("ok", resp => console.log("receive", resp.ping))
```

Refresh the page, and you will see something like this:
```
send ping
Joined ping {}
receive pong
```

Note that the ping is sent before our joined reply comes in. In javascript, if the client hasn't connected to the Channel yet, the message will be buffered in memory and sent as soon as the Channel is connected. It is stored in a short-lived(5-second) buffer so that is doesn't immediately fail.

It is a best practice to have error and timeout handlers whenever a message is sent to our Channel.
Add the following code to user_socket.js fild:
```js
// Send pong.
console.log("send pong")
channel
  .push("pong")
  .receive("ok", resp => console.log("won't happen"))
  .receive("error", resp => console.error("won't happen yet"))
  .receive("timeout", resp => console.error("pong message timeout", resp))
```

Refresh the page and the timeout message will appear.

Now, add code in ping_channel.ex file:
```elixir
  def handle_in("param_ping", %{"error" => true}, socket) do
    {:reply, {:error, %{reason: "You asked for this!"}}, socket}
  end

  def handle_in("param_ping", payload, socket) do
    {:reply, {:ok, payload}, socket}
  end
```

and in user_socket.js file:
```js
channel
.push("param_ping", {error: true})
.receive("error", resp => console.error("param_ping error: ", resp))

channel
  .push("param_ping", {error: false, arr: [1, 2]})
  .receive("ok", resp => console.log("param_ping ok: ", resp))
```

Refresh the page and look the logs in console tab.

### Receiving messages from server
Now, let's implement receiving messages from server.
In user_socket.js file add a listener:
```js
// Listener to listen send_ping event..
channel.on("send_ping", payload => {
  console.log("ping requested", payload)
  channel.push("ping")
    .receive("ok", resp => console.log("ping: ", resp.ping))
})
```

In console, run:
`HelloSocketsWeb.Endpoint.broadcast("ping", "request_ping", %{})`

This will cause a message to be pushed to all connected clients on the "ping" topic. Our hadle_out function changes the original request_ping payload into a different message. You can see the final result in the developer console.

```
ping requested {from_node: 'nonode@nohost'}
ping:  pong
```

When we open multiple web pages, the broadcast message will be sent to all pages. Replies, on the other hand, will only be sent to the client thate sent the message.

### Client fault tolerance and error handling
When you stop the server, errors messages will appear in browser console tab. When server restarts the javascript client join to the topic again.

Add code in user_socket.js:
```js
// Send invalid event.
channel
  .push("invalid")
  .receive("ok", resp => console.log("won't happen"))
  .receive("error", resp => console.error("won't happen yet"))
  .receive("timeout", resp => console.error("invalid event timeout", resp))
```

With it, the erro message will appear in iex console.
