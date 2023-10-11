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
