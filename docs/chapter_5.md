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