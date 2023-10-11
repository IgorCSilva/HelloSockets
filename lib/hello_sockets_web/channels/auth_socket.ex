defmodule HelloSocketsWeb.AuthSocket do
  use Phoenix.Socket
  require Logger

  channel "ping", HelloSocketsWeb.PingChannel
  channel "tracked", HelloSocketsWeb.TrackedChannel
  channel "user:*", HelloSocketsWeb.AuthChannel
  channel "recurring", HelloSocketsWeb.RecurringChannel

  def connect(%{"token" => token}, socket, _connect_info) do
    IO.inspect(socket)
    case verify(socket, token) do
      {:ok, user_id} ->
        socket = assign(socket, :user_id, user_id)
        {:ok, socket}

      {:error, err} ->
        Logger.error("#{__MODULE__} connect error #{inspect(err)}")
        :error
    end
  end

  def connect(_, _socket, _connect_info) do
    Logger.error("#{__MODULE__} connect error missing params")
    :error
  end

  @one_day 86400

  defp verify(socket, token),
    do:
      Phoenix.Token.verify(
        socket,
        "salt identifier", # provides additional cryptographic protection for the token. This value can be anything as long as it remains the same between the token being signed and verified.
        token,
        max_age: @one_day
      )

  def id(%{assigns: %{user_id: user_id}}) do
    "auth_socket:#{user_id}"
  end
end
