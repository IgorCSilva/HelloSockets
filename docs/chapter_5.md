# Dive Deep into Phoenix Channels

A client could be connected to one Socket and three Channels. If the client became disconnected from the server, then the server has zero Sockets and zero Channels. When the client reconnects to the server, the server has one Socket and zero Channels. In this scenario all of the Channel information has been lost from the server, which means that our application would not be working properly.

Throughout this scenario, the client knows that it’s supposed to be connected to the server and which channel topics it should be connected to. This means that the client can reconnect to the server (creating one Socket) and then resubscribe to all of the topics (creating three Channels). This puts the client back in a correct state with an amount of downtime based on how long it took to establish the connection and subscriptions.

The official Phoenix JavaScript client handles this reconnection scenario for us automatically. If you’re using a non-standard client implementation, then you need to specifically consider this event in order to prevent your clients from ending up in an incorrect state after reconnection.

## Use Channels in a Cluster

### Connecting a local cluster

Start a local elixir node with a name and up server:
`iex --name server@127.0.0.1 -S mix phx.server`

Now, start a second node in another terminal:
`iex --name remote@127.0.0.1 -S mix`

We have now two nodes running on the same host domain. You can use Node.list/0 to view all currently connected nodes and see that there are none.
Let's connect remote node to the server node:
```bash
iex(remote@127.0.0.1)1> Node.list()
[]
iex(remote@127.0.0.1)2> Node.connect(:"server@127.0.0.1")
true
iex(remote@127.0.0.1)3> [notice] global: Name conflict terminating {Swoosh.Adapters.Local.Storage.Memory, #PID<23342.352.0>}

iex(remote@127.0.0.1)3> Node.list()                      
[:"server@127.0.0.1"]
```

We can broadcast a message from our remote node, which is incapable of serving Sockets, and see it on a client that is connected to a Socket on our main server. Let's test it.

Connect to the ping topic to establish the connection:
```bash
wscat -c 'ws://localhost:4000/socket/websocket?vsn=2.0.0'
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
```

Next, broadcast a message from te remote node:
```bash
iex(remote@127.0.0.1)4> HelloSocketsWeb.Endpoint.broadcast("ping", "request_ping", %{})
:ok
```

Then you can see that the ping request made it to the client:
```bash
...
< ["1",null,"ping","send_ping",{"from_node":"server@127.0.0.1"}]
```

The node that sent the message to the client is server@127.0.0.1 but we sent our broadcast from remote@127.0.0.1 . This means that the message was distributed across the cluster and intercepted by the PingChannel on our server node.

In practice, our remote node would be serving Socket connections and the entire system would be placed behind a tool that balances connections between the different servers. You could emulate this locally by changing the HTTP port in the application configuration and connecting to the new port with wscat.

In config/dev.exs file add http configuration:
```elixir
config :hello_sockets, HelloSocketsWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PORT") || "4000")]
```

Now you can start the remote server in HTTP mode by prepending PORT=4001 to the command.

Restart the server node:
`iex --name server@127.0.0.1 -S mix phx.server`

Then, start the remote node with this command:
`PORT=4001 iex --name remote@127.0.0.1 -S mix phx.server`

You can send broadcast messages from one node to another and see the client responses.
Connect nodes:
- in server node:
```bash
iex(server@127.0.0.1)2> Node.connect(:"remote
@127.0.0.1")
true
iex(server@127.0.0.1)3> Node.list()
[:"remote@127.0.0.1"]
```

- in remote node:
```bash
iex(remote@127.0.0.1)2> Node.list()
[:"server@127.0.0.1"]
```

Establish clients connections:
- server client terminal:
```bash
wscat -c 'ws://localhost:4000/socket/websocket?vsn=2.0.0'
Connected (press CTRL+C to quit)
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
```

- remote client terminal (with port 4001):
```bash
wscat -c 'ws://localhost:4001/socket/websocket?vsn=2.0.0'
Connected (press CTRL+C to quit)
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
```

Broadcast message from both nodes:
```bash
...
iex(server@127.0.0.1)5> HelloSocketsWeb.Endpoint.broadcast("ping", "request_ping", %{})
:ok
```

and

```bash
iex(remote@127.0.0.1)3> HelloSocketsWeb.Endpoint.broadcast("ping", "request_ping", %{})
:ok
```

Finally, in the client terminal we can see:
- server client:
```bash
...
< ["1",null,"ping","send_ping",{"from_node":"server@127.0.0.1"}]
< ["1",null,"ping","send_ping",{"from_node":"server@127.0.0.1"}]
```

- remote client:
```bash
...
< ["1",null,"ping","send_ping",{"from_node":"remote@127.0.0.1"}]
< ["1",null,"ping","send_ping",{"from_node":"remote@127.0.0.1"}]

```

### Challenges with Distributed Channels
Our clients may disconnect from a node and end up on a different node with different internal state. We must accommodate this by having a central source of truth that any node can reference; this is most commonly a shared database.

## Customize Channel Behavior
A Phoenix Channel is backed by a GenServer that lets it receive messages and store state.

### Send a Recurring Message
Implementation to send message periodically.

Add a new recurring Channel route to the AuthSocket module.
- in auth_socket.ex
```elixir
  channel "recurring", HelloSocketsWeb.RecurringChannel
```

Now, create the Recurring Channel.
- in recurring_channel.ex file:
```elixir
defmodule HelloSocketsWeb.RecurringChannel do
  use Phoenix.Channel
  
  @send_after 5_000
  
  def join(_topic, _payload, socket) do
    schedule_send_token()
    {:ok, socket}
  end
  
  defp schedule_send_token do
    Process.send_after(self(), :send_token, @send_after)
  end
  
  def handle_info(:send_token, socket) do
    schedule_send_token()
    push(socket, "new_token", %{token: new_token(socket)})
  end
  
  defp new_token(socket = %{assigns: %{user_id: user_id}}) do
    Phoenix.Token.sign(socket, "salt identifier", user_id)
  end
end
```

Now let's add a subscription to RecurringChannel in our JavaScript.
- in user_socket.js file:
```javascript
// Subscription to RecurringChannel.
const recurringChannel = authSocket.channel("recurring")

recurringChannel.on("new_token", (payload) => {
  console.log("received new auth token", payload)
})

recurringChannel.join()
```

Refresh your web page and see the logs.

### Deduplicate Outgoing Messages
We'll be using Socket.assigns to store state that is relevant to our Channel.
Any data that we add to Socket.assigns is for our Channel process only and won't be seen by other Channel processes, even Channels that use the same Socket. It is possible because Elixir is functional and generally side-effect free. If we modify the state of a Channel process, other processes in the system are not affected.

Add a new Channel route:
- in user_socket.ex file:
```elixir
  channel "dupe", HelloSocketsWeb.DedupeChannel
```

Create Channel file.
- in dedupe_channel.ex file:
```elixir
defmodule HelloSocketsWeb.DedupeChannel do
  use Phoenix.Channel
  intercept ["number"]

  def join(_topic, _payload, socket) do
    {:ok, socket}
  end

  def handle_out("number", %{number: number}, socket) do
    buffer = Map.get(socket.assigns, :buffer, [])
    next_buffer = [number | buffer]

    next_socket =
      socket
      |> assign(:buffer, next_buffer)
      |> enqueue_send_buffer()

    {:noreply, next_socket}
  end

  # The state awaiting_buffer? is used to prevent multiple send_buffer messages from being enqueued during a single time period.
  defp enqueue_send_buffer(socket = %{assigns: %{awaiting_buffer?: true}}) do
    socket
  end
  defp enqueue_send_buffer(socket) do
    Process.send_after(self(), :send_buffer, 1_000)
    assign(socket, :awaiting_buffer?, true)
  end

  def handle_info(:send_buffer, socket = %{assigns: %{buffer: buffer}}) do
    buffer
    |> Enum.reverse()
    |> Enum.uniq()
    |> Enum.each(&push(socket, "number", %{value: &1}))

    next_socket =
      socket
      |> assign(:buffer, [])
      |> assign(:awaiting_buffer?, false)

    {:noreply, next_socket}

  end

  def broadcast(numbers, times) do
    Enum.each(1..times, fn _ ->
      Enum.each(numbers, fn number ->
        HelloSocketsWeb.Endpoint.broadcast!("dupe", "number", %{number: number})
      end)
    end)
  end
end
```

We broadcast a single message for each number. This means that every broadcast causes handle_out to be called a single time. If we enqueue [1, 2] 20 times, then there would be 40 broadcasts handled by the Channel.

Add a client in user_socket.js:
```javascript
const dupeChannel = socket.channel("dupe")

dupeChannel.on("number", (payload) => {
  console.log("new number received", payload)
})

dupeChannel.join()
```

Now, start the server:
`iex -S mix phx.server`

In terminal, execute:
`HelloSocketsWeb.DedupeChannel.broadcast([1, 2, 3], 100)`

In console we can see the result:

new number received Object { value: 1 }
new number received Object { value: 2 }
new number received Object { value: 3 }


## Write Tests
Write UserSocket tests.
- in /test/hello_sockets_web/channels/user_socket_test.exs, write:
```elixir
defmodule HelloSocketsWeb.UserSocketTest do
  use HelloSocketsWeb.ChannelCase

  alias HelloSocketsWeb.UserSocket

  describe "connect/3" do
    test "can be connected to without parameters" do
      assert {:ok, %Phoenix.Socket{}} = connect(UserSocket, %{})
    end
  end
  
  describe "id/1" do
    test "an identifier is not provided" do
      assert {:ok, socket} = connect(UserSocket, %{})
      assert UserSocket.id(socket) == nil
    end
  end
end
```

Now, tests for AuthSocket:
- in /test/hello_sockets_web/channels/auth_socket_test.exs add:
```elixir
defmodule HelloSocketsWeb.AuthSocketTest do
  use HelloSocketsWeb.ChannelCase

  import ExUnit.CaptureLog
  alias HelloSocketsWeb.AuthSocket

  # This function will help our tests by creating a valid or invalid token in a very simple and concise way.
  defp generate_token(id, opts \\ []) do
    salt = Keyword.get(opts, :salt, "salt identifier")
    Phoenix.Token.sign(HelloSocketsWeb.Endpoint, salt, id)
  end

  describe "connect/3" do

    # The user id doesn't matter in this case because any valid user is allowed to connect.
    test "can be connected to with a valid token" do
      assert {:ok, %Phoenix.Socket{}} = connect(AuthSocket, %{"token" => generate_token(1)})
      assert {:ok, %Phoenix.Socket{}} = connect(AuthSocket, %{"token" => generate_token(2)})
    end
  end

  describe "connect/3 error" do
    test "cannot be connected to with an invalid salt" do
      params = %{"token" => generate_token(1, salt: "invalid")}
      assert capture_log(fn ->
        assert :error = connect(AuthSocket, params)
      end) =~ "[error] #{AuthSocket} connect error :invalid"
    end

    test "cannot be connected to without a token" do
      params = %{}
      assert capture_log(fn ->
        assert :error = connect(AuthSocket, params)
      end) =~ "[error] #{AuthSocket} connect error missing params"
    end

    test "cannot be connected to with a nonsense token" do
      params = %{"token" => "nonsense"}
      assert capture_log(fn ->
        assert :error = connect(AuthSocket, params)
      end) =~ "[error] #{AuthSocket} connect error :invalid"
    end
  end

  describe "id/1" do
    test "an identifier is based on the connected ID" do
      assert {:ok, socket} = connect(AuthSocket, %{"token" => generate_token(1)})
      assert AuthSocket.id(socket) == "auth_socket:1"

      assert {:ok, socket} = connect(AuthSocket, %{"token" => generate_token(2)})
      assert AuthSocket.id(socket) == "auth_socket:2"
    end
  end
end
```

In this id test, we use a successful Socket connection to verify that the Socket is identified with the user ID authentication information.
Adding IO.inspect(socket) at the the end of this test you will see `assigns: %{user_id: 2}`.