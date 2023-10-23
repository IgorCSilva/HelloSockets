// NOTE: The contents of this file will only be executed if
// you uncomment its entry in "assets/js/app.js".

// Bring in Phoenix channels client library:
import {Socket} from "phoenix"

// And connect to the path in "lib/hello_sockets_web/endpoint.ex". We pass the
// token for authentication. Read below how it should be used.
let socket = new Socket("/socket", {})
// let socket = new Socket("/socket", {params: {token: window.userToken}})

// When you connect, you'll often need to authenticate the client.
// For example, imagine you have an authentication plug, `MyAuth`,
// which authenticates the session and assigns a `:current_user`.
// If the current user exists you can assign the user's token in
// the connection for use in the layout.
//
// In your "lib/hello_sockets_web/router.ex":
//
//     pipeline :browser do
//       ...
//       plug MyAuth
//       plug :put_user_token
//     end
//
//     defp put_user_token(conn, _) do
//       if current_user = conn.assigns[:current_user] do
//         token = Phoenix.Token.sign(conn, "user socket", current_user.id)
//         assign(conn, :user_token, token)
//       else
//         conn
//       end
//     end
//
// Now you need to pass this token to JavaScript. You can do so
// inside a script tag in "lib/hello_sockets_web/templates/layout/app.html.heex":
//
//     <script>window.userToken = "<%= assigns[:user_token] %>";</script>
//
// You will need to verify the user token in the "connect/3" function
// in "lib/hello_sockets_web/channels/user_socket.ex":
//
//     def connect(%{"token" => token}, socket, _connect_info) do
//       # max_age: 1209600 is equivalent to two weeks in seconds
//       case Phoenix.Token.verify(socket, "user socket", token, max_age: 1_209_600) do
//         {:ok, user_id} ->
//           {:ok, assign(socket, :user, user_id)}
//
//         {:error, reason} ->
//           :error
//       end
//     end
//
// Finally, connect to the socket:
socket.connect()

// Now that you are connected, you can join channels with a topic.
// Let's assume you have a channel with a topic named `room` and the
// subtopic is its id - in this case 42:
// let channel = socket.channel("room:42", {})
// channel.join()
//   .receive("ok", resp => { console.log("Joined successfully", resp) })
//   .receive("error", resp => { console.log("Unable to join", resp) })

// let channel = socket.channel("ping", {})
// channel.join()
//   .receive("ok", resp => { console.log("Joined ping", resp) })
//   .receive("error", resp => { console.log("Unable to join ping", resp) })

// // Listener.
// channel.on("send_ping", payload => {
//   console.log("ping requested", payload)
//   channel.push("ping")
//     .receive("ok", resp => console.log("ping: ", resp.ping))
// })

// // Sending message.
// console.log("send ping")
// channel
//   .push("ping")
//   .receive("ok", resp => console.log("receive", resp.ping))

// // Send pong.
// console.log("send pong")
// channel
//   .push("pong")
//   .receive("ok", resp => console.log("won't happen"))
//   .receive("error", resp => console.error("won't happen yet"))
//   .receive("timeout", resp => console.error("pong message timeout", resp))

// channel
// .push("param_ping", {error: true})
// .receive("error", resp => console.error("param_ping error: ", resp))

// channel
//   .push("param_ping", {error: false, arr: [1, 2]})
//   .receive("ok", resp => console.log("param_ping ok: ", resp))


// // Send invalid event.
// channel
//   .push("invalid")
//   .receive("ok", resp => console.log("won't happen"))
//   .receive("error", resp => console.error("won't happen yet"))
//   .receive("timeout", resp => console.error("invalid event timeout", resp))

// // Authentication.
// const authSocket = new Socket("/auth_socket", {
//   params: {token: window.authToken}
// })

// authSocket.onOpen(() => console.log('authSocket connected'))
// authSocket.connect()


// // Subscription to RecurringChannel.
// const recurringChannel = authSocket.channel("recurring")

// recurringChannel.on("new_token", (payload) => {
//   console.log("received new auth token", payload)
// })

// recurringChannel.join()

// // Dedupe pattern.
// const dupeChannel = socket.channel("dupe")

// dupeChannel.on("number", (payload) => {
//   console.log("new number received", payload)
// })

// dupeChannel.join()

// // Connect to stats socket.
// const statsSocket = new Socket("/stats_socket", {})
// statsSocket.connect()

// const statsChannelInvalid = statsSocket.channel("invalid")
// statsChannelInvalid.join()
//   .receive("error", () => statsChannelInvalid.leave())

// const statsChannelValid = statsSocket.channel("valid")
// statsChannelValid.join()

// for (let i = 0; i < 5; i++) {
//   statsChannelValid.push("ping")
// }

// // Slow executions.
// const slowStatsSocket = new Socket("/stats_socket", {})
// slowStatsSocket.connect()

// const slowStatsChannel = slowStatsSocket.channel("valid")
// slowStatsChannel.join()

// for (let i = 0; i < 5; i++) {
//   slowStatsChannel.push("slow_ping")
//     .receive("ok", () => console.log("Slow ping response received", i))
//     .receive("error", (error) => console.log("Error for request", i, error))
//     .receive("timeout", resp => console.error("pong message timeout", resp))
// }

// console.log("5 slow pings requested")

// // Fast executions.
// const fastStatsSocket = new Socket("/stats_socket", {})
// fastStatsSocket.connect()

// const fastStatsChannel = fastStatsSocket.channel("valid")
// fastStatsChannel.join()

// for (let i = 0; i < 5; i++) {
//   fastStatsChannel.push("parallel_slow_ping")
//     .receive("ok", () => console.log("Parallel slow ping response received", i))
//     .receive("error", (error) => console.log("Error for request", i, error))
//     .receive("timeout", resp => console.error("pong message timeout", resp))
// }

// console.log("5 parallel slow pings requested")

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

authUserChannel.on("push_timed", (payload) => {
  console.log("received timed auth user push", payload)
})

authUserChannel.join()

export default socket
