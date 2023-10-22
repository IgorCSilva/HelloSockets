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

Elixir is a parallel execution machine. Each Channel can leverage the principles of OTP design to execute work in parallel with other Channels, since the BEAM executes multiple processes at once.

We'll leverage our existing StatsChannel to see the effect of process slowness.
Let's add a new message handler that responds very slowly.

- in lib/hello_sockets_web/channels/stats_channel.exs:
```elixir
def handle_in("slow_ping", _payload, socket) do
  Process.sleep(3_000)
  {:reply, {:ok, %{ping: "pong"}}, socket}
end
```

Then, add in the client user_socket.js:
```javascript
const slowStatsSocket = new Socket("/stats_socket", {})
slowStatsSocket.connect()

const slowStatsChannel = slowStatsSocket.channel("valid")
slowStatsChannel.join()

for (let i = 0; i < 5; i++) {
  slowStatsChannel.push("slow_ping")
    .receive("ok", () => console.log("Slow ping response received", i))
    .receive("error", (error) => console.log("Error for request", i, error))
    .receive("timeout", resp => console.error("pong message timeout", resp))
}

console.log("5 slow pings requested")
```

Notice that all only some messages will receive a response. The others can receive the timeout response. This means there is no parallelism present, even though we're using one of the most parallell languages available.

The root cause of this proble is that our Channel is a single process that can handle only one message at a time. Whan a message is slow to process, other messages in the queue have to await for it to complete.

Phoenix provides a solution for this problem. We'll use Phoenix's socket_ref/1 function to turn our Socket into a minimally represented format that can be passed around.

- in lib/hello_sockets_web/channels/stats_channel.ex, add:
```elixir
def handle_in("parallel_slow_ping", _payload, socket) do
  ref = socket_ref(socket)

  Task.start_link(fn ->
    Process.sleep(3_000)
    Phoenix.Channel.reply(ref, {:ok, %{ping: "pong"}})
  end)

  {:noreply, socket}
end
```

We spawn a linked Task that starts a new process and executes the given function.
Task is used to get a Process up and running very quickly. In practice, however, you'll probably e calling into a GenServer.
Finally, we use Phoenix.Channel.reply/2 to send a response to eh Socket.

Let's copy and update client code to use our asynchronous Channel:
- in hello_sockets/assets/js/user_socket.js:
```javascript
const fastStatsSocket = new Socket("/stats_socket", {})
fastStatsSocket.connect()

const fastStatsChannel = fastStatsSocket.channel("valid")
fastStatsChannel.join()

for (let i = 0; i < 5; i++) {
  fastStatsChannel.push("parallel_slow_ping")
    .receive("ok", () => console.log("Parallel slow ping response received", i))
    .receive("error", (error) => console.log("Error for request", i, error))
    .receive("timeout", resp => console.error("pong message timeout", resp))
}

console.log("5 parallel slow pings requested")
```

You will see now all fivve messages load after a three-second wait.

You shouldn't reach for reply/2 for all of you Channels right away. If you have a use case where a potentially slow database query is being called, or if you are leveraging a external API, then it's a good fit. We have seen the benefit of using reply/2 of increased parallelism. A trade-of, thoug, is that we lose the ability to slow down a client (back-pressure) if it is asking too much of our system.

## Build a Scalable Data Pipeline

The mechanism that handles outgoing real-time data is a data pipeline.
A data pipeline should have certain traits in order to work quickly and reliable for our users.
Let's use the Elixir library GenStage to build a completely in-memory data pipeline.

### Traits of a data pipeline

- Deliver messages to all relevant clients

This means thatt a real-time event will be broadcast to all our connected Nodes in our data pipeline so they can handle the event for connected Channels. Phoenx PubSub handles this for us, but we must consider that our data pipeline spans multiple servers. We should never send incorrect data to a client.

- Fast data delivery

This allows a client to get the latest information immediately.

- As durable as needed

- As concurrent as needed

Our data pipeline should have limited concurrency so we don't overwhelm our application.

- Measurable

It's important that we know how long it takes to send data to clients.

A good solution for many use cases is a queue-based, GenStage-powered data pipeline. This pipeline exhibits the above traits while also being ease to configure.

### GenStage Powered Pipeline

GenStage helps us write a data ppeline that can exchange data from producers to consumers.

The two main stages types:
- Producer: Coordinates the feching of data items and then passes to the next consumer stage. Producers can fech data from a database, or they can keep it in memory.
- Consumer: Asks for and receives data items form the previous producer stage. These items are then processed by our code before more items are received.

The pipeline that well end up with at the end of this chapter is generic and can be used for many use cases.

The schema configuration:

Aplication Process (1) --add_item--> GenStage Producer Process (items[]) as PP
Aplication Process (2) --add_item--> PP

GenStage Consumer Process as CP --ask_items--> PP
PP --give_items--> CP

Any process in our application will be able to write new items ot the GenStage producer process.

In hello_sockets/mix.exs, add:
```elixir
:gen_stage, "~> 0.14.1"
```

Run `mix deps.get`.

Now, create a basic Producer module:
- in lib/hello_sockets/pipelne/producer.ex, add:
```elixir
defmodule HelloSockets.Pipeline.Producer do
  use GenStage

  def start_link(opts) do
    {[name: name], opts} = Keyword.split(opts, [:name])
    GenStage.start_link(__MODULE__, opts, name: name)
  end

  def init(_opts) do
    {:producer, :unused, buffer_size: 10_000}
  end

  def handle_demand(_demand, state) do
    {:noreply, [], state}
  end

  def push(item = %{}) do
    GenStage.cast(__MODULE__, {:notify, item})
  end

  def handle_cast({:notify, item}, state) do
    {:noreply, [%{item: item}], state}
  end
end
```

And now, the Consumer.
- in lib/hello_sockets/pipelne/consumer.ex, add:
```elixir
defmodule HelloSockets.Pipeline.Consumer do
  use GenStage

  def start_link(opts) do
    GenStage.start_link(__MODULE__, opts)
  end

  def init(opts) do
    subscribe_to = Keyword.get(opts, :subscribe_to, HelloSockets.Pipeline.Producer)
    {:consumer, :unused, subscribe_to: subscribe_to}
  end

  # Every condumer must have a callback function to handle items.
  def handle_events(items, _from, state) do
    IO.inspect(
      {__MODULE__, length(items), List.first(items), List.last(items)}
    )

    {:noreply, [], state}
  end
end
```

The last stage is to configure our prducer and consumer in our application tree.
- in lib/hello_sockets/application.ex, add:
```elixir

  alias HelloSockets.Pipeline.{Consumer, Producer}

  ...
  
    children = [
      ...
      {Producer, name: Producer},
      {Consumer, subscribe_to: [{Producer, max_demand: 10, min_demand: 5}]},
      HelloSocketsWeb.Endpoint
    ]

  ...
```

We add each stage to our application before our Endpoint boots. This is very important because we want our data pipeline to be available before our web endpoints are available.
The min/max demand option helps us configure our pipeline to only process a few items at a time. This should be configured to a low value for in-memory workloads. It is better to have higjer values if using an external data store as this reduces the number of times we go to the external data store.

Let's see what happens when we push itms into our producer.

Run `iex -S mix`.
```
iex(1)> alias HelloSockets.Pipeline.Producer
HelloSockets.Pipeline.Producer
iex(2)> Producer.push(%{})
:ok
iex(3)> {HelloSockets.Pipeline.Consumer, 1, %{item: %{}}, %{item: %{}}}

iex(4)> Enum.each((1..53), &Producer.push(%{n: &1}))
{HelloSockets.Pipeline.Consumer, 1, %{item: %{n: 1}}, %{item: %{n: 1}}}
:ok
{HelloSockets.Pipeline.Consumer, 1, %{item: %{n: 2}}, %{item: %{n: 2}}}
iex(5)> {HelloSockets.Pipeline.Consumer, 1, %{item: %{n: 3}}, %{item: %{n: 3}}}
{HelloSockets.Pipeline.Consumer, 1, %{item: %{n: 4}}, %{item: %{n: 4}}}
{HelloSockets.Pipeline.Consumer, 1, %{item: %{n: 5}}, %{item: %{n: 5}}}
{HelloSockets.Pipeline.Consumer, 1, %{item: %{n: 6}}, %{item: %{n: 6}}}
{HelloSockets.Pipeline.Consumer, 1, %{item: %{n: 7}}, %{item: %{n: 7}}}
{HelloSockets.Pipeline.Consumer, 1, %{item: %{n: 8}}, %{item: %{n: 8}}}
{HelloSockets.Pipeline.Consumer, 1, %{item: %{n: 9}}, %{item: %{n: 9}}}
{HelloSockets.Pipeline.Consumer, 5, %{item: %{n: 10}}, %{item: %{n: 14}}}
{HelloSockets.Pipeline.Consumer, 5, %{item: %{n: 15}}, %{item: %{n: 19}}}
{HelloSockets.Pipeline.Consumer, 5, %{item: %{n: 20}}, %{item: %{n: 24}}}
{HelloSockets.Pipeline.Consumer, 5, %{item: %{n: 25}}, %{item: %{n: 29}}}
{HelloSockets.Pipeline.Consumer, 5, %{item: %{n: 30}}, %{item: %{n: 34}}}
{HelloSockets.Pipeline.Consumer, 5, %{item: %{n: 35}}, %{item: %{n: 39}}}
{HelloSockets.Pipeline.Consumer, 5, %{item: %{n: 40}}, %{item: %{n: 44}}}
{HelloSockets.Pipeline.Consumer, 5, %{item: %{n: 45}}, %{item: %{n: 49}}}
{HelloSockets.Pipeline.Consumer, 4, %{item: %{n: 50}}, %{item: %{n: 53}}}
```

You see the grouping of messages. The consumer starts by processing one item at a time. After ten are processed, the items are processed five at a time until the items are all processed.

This pattern appears a bit unusual because we never see ten items processed at once, and we also see many single itms processed. A GenStage consumer splits events into batches based on the max and min demand. Our values are ten and five, so the events are split into a max batch size of five. The single items are an implementation detail of how the batching works - this isn't a big deal for a real application.

### Adding Concurrency and Channels
GenStage has a solution for adding concurrency to aour pipeline with the ConsumerSupervisor module.
ConsumerSupervisor is a type of GenStage consumer that spawns a child process for each item received.
Spawns processes is cheap to do in Elixir.

Our final result in this chapter will look like this:

Aplication Process (1) --add_item--> GenStage Producer Process (items[]) as PP
Aplication Process (2) --add_item--> PP

GenStage Consumer Process as CP --ask_items--> PP
PP --give_items--> CP

CP --> (Dynamic Worker Process[])

Create a ConsumerSupervisor and add to our pipeline.
- in lib/hello_sockets/pipeline/consumer_supervisor.ex:
```elixir
defmodule HelloSockets.Pipeline.ConsumerSupervisor do
  use ConsumerSupervisor

  alias HelloSockets.Pipeline.{Producer, Worker}

  def start_link(opts) do
    ConsumerSupervisor.start_link(__MODULE__, opts)
  end

  def init(opts) do
    subscribe_to = Keyword.get(opts, :subscribe_to, Producer)
    supervisor_opts = [strategy: :one_for_one, subscribe_to: subscribe_to]

    children = [
      %{
        id: Worker,
        start: {Worker, :start_link, []},
        restart: :transient
      }
    ]

    ConsumerSupervisor.init(children, supervisor_opts)
  end
end
```

It is a mix of common Supervisor and Consumer process setup.

Now, replace the previous Producer and Consumer alias with our new module.

- in lib/hello_sockets/application.ex:
```elixir

  alias HelloSockets.Pipeline.Producer
  alias HelloSockets.Pipeline.ConsumerSupervisor, as: Consumer

  ...
```

Define the Worker module now.
- in lib/hello_sockets/pipeline/worker.ex:
```elixir
defmodule HelloSockets.Pipeline.Worker do

  def start_link(item) do
    Task.start_link(fn ->
      process(item)
    end)
  end

  defp process(item) do
    IO.inspect(item)
    Process.sleep(1000)
  end
end
```

Let's observe what happens when we push work through our pipeline:

Run `iex -S mix`.
```
iex(1)> Enum.each((1..50), &HelloSockets.Pipeline.Producer.push(%{n: &1}))
:ok

iex(2)> %{item: %{n: 1}}
%{item: %{n: 2}}
%{item: %{n: 3}}
%{item: %{n: 5}}
%{item: %{n: 6}}
%{item: %{n: 4}}
%{item: %{n: 7}}
%{item: %{n: 8}}
%{item: %{n: 9}}
%{item: %{n: 10}}
%{item: %{n: 11}}
%{item: %{n: 12}}

...

```

You'll see that the jobs run ten at a time with a delay in between. The items always group together the same way, but the group itself can come in any order.
The GenStage batch size hasn't changed, but the ConsumerSupervisor is able to start up max_demand (ten) workers at a time.

Let's change our Worker module to do some real work. We'll push items for a particular user from our server to our AuthChannel.
Replace the process/1 function with the following code:
```elixir
  defp process(%{item: %{data: data, user_id: user_id}}) do
    Process.sleep(1000)
    HelloSocketsWeb.Endpoint.broadcast!("user:#{user_id}", "push", data)
  end
```

The pushed data and user ID are passed via the data pipeline item.

The final step is to connect to our private user topic and listen for the push event.
- in hello_sockets/assets/js/user_socket.js:
```javascript
// Push data to a particular user and use GenStage producer and consumer.
const authSocket = new Socket("/auth_socket", {
  params: {token: window.authToken}
})

authSocket.onOpen(() => console.log('authSocket connected'))
authSocket.connect()

const authUserChannel = authSocket.channel(`user:${window.userId}`)

authUserChannel.on("push", (payload) => {
  console.log("received auth user push", payload)
})

authUserChannel.join()
```

Start the server with `iex -S mix phx.server` and load `http://localhost:4000`.

Execute the code below and observe the browser console.
If you change the user id in server, the data won't be delivered to the browser client.

### Measuring our Pipeline