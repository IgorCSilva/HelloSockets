# Connect a simple WebSocket

## Project setup

Creating project:
<br>
- `mix phx.new hello_sockets --no-ecto`

Understand phoenix channels:
<br>
- `mix help phx.gen.channel`

Creating phoenix channel called User:
<br>
- `mix phx.gen.channel User`

Running this command will create theses files:
* creating lib/hello_sockets_web/channels/user_channel.ex
* creating test/hello_sockets_web/channels/user_channel_test.exs
* creating test/support/channel_case.ex

If socket handler is not find, the prompt will ask for create:

* The default socket handler - HelloSocketsWeb.UserSocket - was not found.
* Do you want to create it? [Yn] Y

Now, the following files will be created:
* creating lib/hello_sockets_web/channels/user_socket.ex
* creating assets/js/user_socket.js

- Add the handler to endpoint file:
```elixir
  socket "/socket", HelloSocketsWeb.UserSocket,
    websocket: true,
    longpoll: false
```

- For the front-end integration, you need to import the `user_socket.js` in your `assets/js/app.js` file:
<br>
`import "./user_socket.js"`


## Understand what happens

Run project:
- `mix phx.server`

Now, go in browser and access `http://localhost:4000`. Inspecting the page (right button click and select Inspect) in Network tab, we can see the WebSockets(WS) connections. If necessary, reload the page.

We may see a default phoenix websocket connection, for hot-reload, and the connection labeled `websocket?token=undefined&vsn=2.0.0`.

A WebSocket starts its life as a normal web request that becomes "upgraded" to a WebSocket.

Right-click on `websocket?token=undefined&vsn=2.0.0`, and copy as cURL.
We will have this:
```bash
curl 'ws://localhost:4000/socket/websocket?token=undefined&vsn=2.0.0' \
  -H 'Pragma: no-cache' \
  -H 'Origin: http://localhost:4000' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Sec-WebSocket-Key: PAlvCbC8VR7NbGH4NmeYPA==' \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits' \
  -H 'Cache-Control: no-cache' \
  -H 'Cookie: _hello_sockets_key=SFMyNTY.g3QAAAABbQAAAAtfY3NyZl90b2tlbm0AAAAYR3ZyTVFURnk3NVA4dXkwR1VFanZhM3Ex.yuPTZBAyJsdtwJWLreroH8mb2tTRK1JKVvabRiYwiHg' \
  -H 'Connection: Upgrade' \
  -H 'Sec-WebSocket-Version: 13' \
  --compressed
```

Replace ws:// with http://, add -i flag and run the following curl command in terminal:
```bash
curl -i 'http://localhost:4000/socket/websocket?token=undefined&vsn=2.0.0' \
  -H 'Pragma: no-cache' \
  -H 'Origin: http://localhost:4000' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Sec-WebSocket-Key: PAlvCbC8VR7NbGH4NmeYPA==' \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits' \
  -H 'Cache-Control: no-cache' \
  -H 'Cookie: _hello_sockets_key=SFMyNTY.g3QAAAABbQAAAAtfY3NyZl90b2tlbm0AAAAYR3ZyTVFURnk3NVA4dXkwR1VFanZhM3Ex.yuPTZBAyJsdtwJWLreroH8mb2tTRK1JKVvabRiYwiHg' \
  -H 'Connection: Upgrade' \
  -H 'Sec-WebSocket-Version: 13' \
  --compressed
```

Our web request has received a 101 HTTP response from the server, which indecates that the connection rotocol changes from http to a WebSocket.
In server terminal we can see the log:
```bash
[info] CONNECTED TO HelloSocketsWeb.UserSocket in 100µs
  Transport: :websocket
  Serializer: Phoenix.Socket.V2.JSONSerializer
  Parameters: %{"token" => "undefined", "vsn" => "2.0.0"}
```

The diagram of the WebSocket connection:
```puml
Client -> Server : http upgraded request.
Server -> Client : http 101 response.
Client <-> Server : Bidirectional messages.
```

The connection cannot be upgraded with cURL, so we'll move back to DevTools for seeing the data exchange.

Phoenix and Elixir make it easy to have tens of thousands of connections on a single server. Each connected Channel and WebSocket in your application has independent memory management and garbage coolection because of OTP processes. An advantage of this process-based architecture is that WebSocket connections eith are not being used often can be stored in a hibernated state, which consumes very little memory.