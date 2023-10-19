# Avoid Performance Pitfalls

## Measure Everything

### Types of measurements
- Count occurrences
- Count at a point in time
- Timing of operation

Shared online application often use the concept of "tenant" to isolate a customer's data. We could add a tenant_id=XX tag to all metrics to understand the current system health from the perspective of a single tenant.

### Collect Measurements using StatsD

StatsD is a daemon that aggregates statistics; it takes measurements sent by our application and aggregates them into other back ends that collect the stats.

We'll use a fake StatsD server for development that simply logs any packets to the Elixir application console.

- in mix.exs, add the libraries:
```elixir
{:statix, "~> 1.2"},
{:statsd_logger, "~> 1.1", only: [:dev, :test]}
```

Now, run: `mix deps.get` to fetch theses dependencies.

Configure libraries:
- in config/dev.exs, add:
```elixir
config :statsd_logger, port: 8126
config :statix, HelloSockets.Statix, port: 8126
```

Create a Statix module:
- /lib/hello_sockets/statix.ex
```elixir
defmodule HelloSockets.Statix do
  use Statix
end
```

Finally, we must connect Statix to our StatsD server. Add the following code to the top of the start function:
- in /lib/hello_sockets/application.ex, add:
```elixir
def start(_type, _args) do
  :ok = HelloSockets.Statix.connect()
  ...
```

Let's try out Statix now:
Run `iex -S mix`

```
iex(1)> alias HelloSockets.Statix
HelloSockets.Statix
iex(2)> Statix.increment("test")
:ok
iex(3)> StatsD metric: test 1|c
Statix.increment("test", 1, tags: ["name:1", "success:true"])
:ok
StatsD metric: test 1|c|#name:1,success:true
```

The StatsD metric lines indecate that the metric was successfully sent over UDP to the StatsD server.

Let's count the number of Socket connections that occurs in a Socket.
- in /lib/hello_sockets_web/channels/stats_socket.ex, add:
```elixir
defmodule HelloSocketsWeb.StatsSocket do
  use Phoenix.Socket
  
  channel "*", HelloSocketsWeb.StatsChannel
  
  def connect(_params, socket, _connect_info) do
    HelloSockets.Statix.increment("socket_connect", 1, tags: ["status:success", "socket:StatsSocket"])
    
    {:ok, socket}
  end
  
  def id(_socket) do
    nil
  end
end
```

Now, add the StatsChannel module:
```elixir
defmodule HelloSocketsWeb.StatsChannel do
  use Phoenix.Channel

  def join("valid", _payload, socket) do
    channel_join_increment("success")
    {:ok, socket}
  end

  def join("invalid", _payload, _socket) do
    channel_join_increment("fail")
    {:error, %{reason: "always fails"}}
  end

  defp channel_join_increment(status) do
    HelloSockets.Statix.increment("channel_join", 1, tags: ["status:#{status}", "channel:StatsChannel"])
  end

  # Measures the performance of a request.
  def handle_in("ping", _payload, socket) do
    HelloSockets.Statix.measure("stats_channel.ping", fn ->
      Process.sleep(:rand.uniform(1000))
      {:reply, {:ok, %{ping: "pong"}}, socket}
    end)
  end
end
```

Add the socket to the Endpoint:
- in lib/hello_sockets_web/endpoint.ex
```elixir
socket "/stats_socket", HelloSocketsWeb.StatsSocket,
  websocket: true,
  longpoll: false
```

Configure now, the client to connect and use our Socket:
- in assets/js/user_socket.js
```javascript
// Connect to stats socket.
const statsSocket = new Socket("/stats_socket", {})
statsSocket.connect()

const statsChannelInvalid = statsSocket.channel("invalid")
statsChannelInvalid.join()
  .receive("error", () => statsChannelInvalid.leave())

const statsChannelValid = statsSocket.channel("valid")

for (let i = 0; i < 5; i++) {
  statsChannelValid.push("ping")
}
```

Run our application with: `mix phx.server`
Visite the link: `http://localhost:4000`
We need to see something like this in terminal:

```
StatsD metric: socket_connect 1|c|#status:success,socket:StatsSocket
StatsD metric: channel_join 1|c|#status:fail,channel:StatsChannel
StatsD metric: channel_join 1|c|#status:success,channel:StatsChannel
StatsD metric: stats_channel.ping 953|ms
StatsD metric: stats_channel.ping 718|ms
StatsD metric: stats_channel.ping 332|ms
StatsD metric: stats_channel.ping 26|ms
StatsD metric: stats_channel.ping 831|ms
```


## Keep Your Channels Asynchronous