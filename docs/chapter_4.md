# Restrict Socket and Channel Access

We'll use a Phoenix.Token to pass authentication information from the server to the view, and then will use that to add Channel access restriction to the JavaScript client.

There are two different types of access restricion that we'll focus on. The first type of retriction, authentication, prevents non-users from accessing your application. The second type of restriction, authorization, prevents users fro accessing each other's data.
When you want to prevent non-users from connecting to your application, you add authentication to the Socket. When you want to restrict access to user data, you add authorization to the Channel and topic.

Phoenix provides two different entry points where you can add access restriction. Socket Authentication is handled in the Socket.connect/3 function and Channel authorization is handled in the Channel.join/3 function.

## Add Authentication to Sockets

A Socket's connect/3 callback function return the tuple {:ok, socket} when the connection is allowed, or :error when the connection is rejected. The connect/3 callback is also used to store data for the life of the connection. You can store any data you want in the Socket.assigns state.

### Securing a Socket with Signed Tokens

Let's add our new Socket to our Endpoint. Enter this code after the existing socket/3 function call:
```elixir
socket "/auth_socket", HelloSocketsWeb.AuthSocket,
    websocket: true,
    longpoll: false
```

Next, create the AuthSocket module.
```elixir
defmodule HelloSocketsWeb.AuthSocket do
  use Phoenix.Socket
  require Logger
  
  channel "ping", HelloSocketsWeb.PingChannel
  channel "tracked", HelloSocketsWeb.TrackedChannel
  
  def connect(%{"token" => token}, socket) do
    case verify(socket, token) do
      {:ok, user_id} ->
        socket = assign(socket, :user_id, user_id)
        
      {:error, err} ->
        Logger.error("#{__MODULE__} connect error #{inspect(err)}")
        :error
    end
  end
  
  def connect(_, socket) do
    Logger.error("#{__MODULE__} connect error missing params")
    :error
  end
end
```

It's a good practice to always log when a Socket or Channel connection error happens.
Add now the verification function:
```elixir
  @one_day 86400
  
  defp verify(socket, token),
    do:
      Phoenix.Token.verify(
        socket,
        "salt identifier", # provides additional cryptographic protection for the token. This value can be anything as long as it remains the same between the token being signed and verified.
        token,
        max_age: @one_day
      )
```

Phoenix.Token uses a separate secret key to sign all data. This key, called secret_key_base, is automatically extracted from outr socket, but it could be provided through other means as well.
Phoenix.Token signs messages to prevent tampering but it does not encrypt data. You should not keep anything sensitive in the signed message, such as a password or personally identifying information, because this data can be read by anyoune who has access to the user's client.

The final step for AuthSocket is to define an identifier for the Socket. This is completely optional; we could retur nil, but it is a best practice to identify a Socket when it  s for a particular user. We can do things like a disconnecting a specific user or use the Socket identifier in other parts of the system.

Add an id/1 function to Auth Socket:
```elixir
def id(%{assigns: %{user_id: user_id}}) do
  "auth_socket:#{user_id}"
end
```

We now have an Auth Socket that requires a signed token to connect to it.
Let's try connecting to it without a token, with an invalid token, and with a valid token.

Start the sever:
`iex -S mix phx.server`

Now, try connect without a token:
`wscat -c 'ws://localhost:4000/auth_socket/websocket?vsn=2.0.0'`

and we'll receive:
```bash
error: Unexpected server response: 403
```
In server terminal: `[error] Elixir.HelloSocketsWeb.AuthSocket connect error missing params`

Now, let's add in a fake token value:
```bash
wscat -c 'ws://localhost:4000/auth_socket/websocket?vsn=2.0.0&token=x'
error: Unexpected server response: 403
```
In server terminal: `[error] Elixir.HelloSocketsWeb.AuthSocket connect error :invalid`

Let's fix that by generating a real token and connecting. In server terminal, generate a valid token for ID 1:
```bash
iex(2)> Phoenix.Token.sign(HelloSocketsWeb.Endpoint, "salt identifier", 1)
"SF..Yk"
```

and

```bash
wscat -c 'ws://localhost:4000/auth_socket/websocket?vsn=2.0.0&token=SF..Yk'
Connected (press CTRL+C to quit)
> ["1", "1", "ping", "phx_join", {}]
< ["1","1","ping","phx_reply",{"response":{},"status":"ok"}]
> ["1", "2", "ping", "ping", {}]
< ["1","2","ping","phx_reply",{"response":{"ping":"pong"},"status":"ok"}]

```
In server terminal: `[info] CONNECTED TO HelloSocketsWeb.AuthSocket in 1ms`

### Different Types of Tokens
Alternatives to Phoenix.Token can help us in these situations. A very common web standard for authentication is the JSON Web Token (JWT). JWTs are cryptographically secure but not encrypted (an encrypted variant called JWE does exist), so they meet the same security standard as Phoenix.Token.
You'll have to do a bit more work to use JWTs as compared to Phoenix.Token because JWT support is not included out-of-the-box with Phoenix. JWTs are not a proper replacement for for cookie-based authentication. They should only be used to pass a user session between different parts of an application.f

## Add Authorization to Channels
There are two options for how to add Chanel authorization:
- Parameter based: The client's authentication token is sent via these parameters and the Channel can authorize the topic using the data encoded into the token.
- Socket state based: You can store information about the current connection, such as the connected user's ID or token, when a Socket connection occurs. This state becomes available in Socket.assigns and can be used in your Channel's join/3 function.

There are advantages to the Socket state-based approach that make it the best choice most of the time.

Let's secure a topic based on the topic's name matching the provided user ID.
In auth_socket.ex file, add:
```elixir
  channel "user:*", HelloSocketsWeb.AuthChannel
```

Create the channel:
```elixir
defmodule HelloSocketsWeb.AuthChannel do
  use Phoenix.Channel

  require Logger

  def join(
    "user:" <> req_user_id,
    _payload,
    socket = %{assigns: %{user_id: user_id}}
  ) do
    if req_user_id == to_string(user_id) do
      {:ok, socket}
    else
      Logger.error("#{__MODULE__} failed #{req_user_id} != #{user_id}")
      {:error, %{reason: "unauthorized"}}
    end
  end
end
```

Now, create another token:
```bash
iex(2)> Phoenix.Token.sign(HelloSocketsWeb.Endpoint, "salt identifier", 1)
"SFMyNTY.g2gDYQFuBgAe...k_FC4wmTsViFYBvm7JZMMenuJuA"
```

In terminal, execute:
```bash
wscat -c 'ws://localhost:4000/auth_socket/websocket?vsn=2.0.0&token=SF...uA'
> ["1", "1", "user:2", "phx_join", {}]
< ["1","1","user:2","phx_reply",{"response":{"reason":"unauthorized"},"status":"error"}]
> ["1", "1", "user:1", "phx_join", {}]
< ["1","1","user:1","phx_reply",{"response":{},"status":"ok"}]
```

## Use Authentication from JavaScript
Replace the existing home/2 function in page_controller.ex with the following code:
```elixir
  def index(conn, _params) do
    fake_user_id = 1

    conn
    |> assign(:auth_token, generate_auth_token(conn, fake_user_id))
    |> assign(:user_id, fake_user_id)
    |> render("index.html")
  end

  defp generate_auth_token(conn, user_id) do
    Phoenix.Token.sign(conn, "salt identifier", user_id)
  end
```

You need rename the file in folder page_html from home.html.heex to index.html.heex. Change in router definition in router.ex too.
OBS.: Changing names from home to index just to be equal to the book.

Add the script in index.html.heex:
```html
<script>
  window.authToken = "<%= assigns[:auth_token] %>";
  window.userId = "<%= assigns[:user_id] %>";
</script>
```

We complete by passing authentication params int our new authSocket in user_socket.js.
```js
// Authentication.
const authSocket = new Socket("/auth_socket", {
  params: {token: window.authToken}
})

authSocket.onOpen(() => console.log('authSocket connected'))
authSocket.connect()
```

After that we have a successful connection when access the web page in http://localhost:4000.

If you do find yourself wanting to add topic-level authentication (where the token is provided with the topic join request), it's possible to add a params argument that contains the token to socket.channel(channel, params).

