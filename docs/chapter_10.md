# Track Connected Carts with Presence

## Use Tracker in an Application

First, create a tracker module.
- in lib/hello_sockets_web/channels/user_tracker.ex:
```elixir
defmodule HelloSocketsWeb.UserTracker do
  @behaviour Phoenix.Tracker

  require Logger

  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]},
      type: :supervisor
    }
  end

  def start_link(opts) do
    opts =
      opts
      |> Keyword.put(:name, __MODULE__)
      |> Keyword.put(:pubsub_server, HelloSockets.PubSub)

    Phoenix.Tracker.start_link(__MODULE__, opts, opts)
  end

  def init(opts) do
    server = Keyword.fetch!(opts, :pubsub_server)

    {:ok, %{pubsub_server: server}}
  end

  def handle_diff(changes, state) do
    Logger.info inspect({"tracked changes", changes})
    {:ok, state}
  end
end
```

Here, a Tracker process is started. It supervises a collection of Phoenix.Tracker.Shard processes.
Each Tracker.Shard process collects changes in its state and broadcasts the changes over Phoenix PubSub to all other nodes in the cluster.
The init/1 function is called for each Shart that is created.

Tracker requires that a handle_diff/2 function is implemented. This will allow us to inspect the changes as Channels are joined and closed.

Define the public interface.
- in :
```elixir
  def track(
    %{
      channel_pid: pid,
      topic: topic,
      assigns: %{user_id: user_id}
    }
  ) do
    metadata = %{
      online_at: DateTime.utc_now(),
      user_id: user_id
    }

    Phoenix.Tracker.track(__MODULE__, pid, topic, user_id, metadata)
  end

  def list(topic \\ "tracked") do
    Phoenix.Tracker.list(__MODULE__, topic)
  end
```

Now, add the UserTracker to the application's supervison tree after the Endpoint.
- in lib/hello_sockets/application.ex:
```elixir
  {HelloSocketsWeb.UserTracker, [pool_size: :erlang.system_info(:schedulers_online)]}
```

Next create a new Channel for our demo.
- in lib/hello_sockets_web/channels/auth_socket.ex:
```elixir

  channel "tracked", HelloSocketsWeb.TrackedChannel
```

- in lib/hello_sockets_web/channels/tracked_channel.ex:
```elixir
defmodule HelloSocketsWeb.TrackedChannel do
  use Phoenix.Channel
  
  alias HelloSocketsWeb.UserTracker
  
  def join("tracked", _payload, socket) do
    send(self(), :after_join)
    {:ok, socket}
  end
  
  def handle_info(:after_join, socket) do
    {:ok, _} = UserTracker.track(socket)
    {:noreply, socket}
  end
end
```

Create a function to handle the /tracked endpoint.
- in lib/hello_sockets_web/controllers/page_controller.ex:
```elixir
  def tracked(conn, params) do
    fake_user_id = Map.get(params, "user_id", "1")
    
    conn
    |> assign(:auth_token, generate_auth_token(conn, fake_user_id))
    |> assign(:user_id, fake_user_id)
    |> render("index.html")
  end
```

Add the new route.
- in lib/hello_sockets_web/router.ex:
```elixir
  get "/tracked", PageController, :tracked
```

Now, update the client with new channel.
- in assets/js/user_socket.js:
```javascript
  // Tracked channels.
  const trackedSocket = new Socket("/auth_socket", {
    params: { token: window.authToken}
  })

  trackedSocket.connect()

  const trackerChannel = trackedSocket.channel('tracked')
  trackerChannel.join()
```

Let's test it. Start two servers as follows.
```
iex --name app@127.0.0.1 -S mix phx.server
# Do not run commands from the 'app' server.

iex --name backend@127.0.0.1 -S mix
iex(1)> Node.connect(:"app@127.0.0.1")
```

Next, load `http://localhost:4000/tracked?user_id=1` and `http://localhost:4000/tracked?user_id=other` in two different tabs.
Run UserTracker.list/0 on both the app and backend nodes to see Tracker in action.

```
iex()> HelloSocketsWeb.UserTracker.list()
[
  {"1",
   %{
     online_at: ~U[2023-11-14 22:14:30.791805Z],
     phx_ref: "F5edDrIH188dmgCj",
     user_id: "1"
   }},
  {"other",
   %{
     online_at: ~U[2023-11-14 22:14:45.670527Z],
     phx_ref: "F5edEiiIpKcdmgKC",
     user_id: "other"
   }}
]
```

## Phoenix Tracker Versus Presence
Phoenix Presence is an implementation of Tracker that provides helper function for working with Channels.

If you want to have every change broadcast to clients on a given topic, then use Presence. If you want to be a in control of how diffs are handled, or if you don't want to bradcast changes to clients, use Tracker.

Now go to the sneakers23 project again...