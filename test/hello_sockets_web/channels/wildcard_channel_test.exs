defmodule HelloSocketsWeb.WildcardChannelTest do
  use HelloSocketsWeb.ChannelCase

  alias HelloSocketsWeb.UserSocket

  describe "join/3 success" do
    test "ok when numbers in the format a:b where b = 2a" do

      # We use subscribe_and_join/3 to join the given topic with certain params.
      assert {:ok, _, %Phoenix.Socket{}} =
        socket(UserSocket, nil, %{})
        |> subscribe_and_join("wild:2:4", %{})

      assert {:ok, _, %Phoenix.Socket{}} =
        socket(UserSocket, nil, %{})
        |> subscribe_and_join("wild:100:200", %{})
    end
  end

  describe "join/3 error" do
    test "error when b is not exactly twice a" do
      assert {:error, %{}} ==
        socket(UserSocket, nil, %{})
        |> subscribe_and_join("wild:1:3", %{})
    end

    test "error when 3 numbers are provided" do
      assert {:error, %{}} ==
        socket(UserSocket, nil, %{})
        |> subscribe_and_join("wild:2:4:8", %{})
    end
  end

  describe "join/3 error causing crash" do
    test "error with an invalid format topic" do
      assert {:error, %{}} ==
        socket(UserSocket, nil, %{})
        |> subscribe_and_join("wild:invalid", %{})
    end
  end

  describe "handle_in pong" do
    test "a pong response is provided" do
      assert {:ok, _, socket} =
        socket(UserSocket, nil, %{})
        |> subscribe_and_join("wild:2:4", %{})

      # Send ping event.
      ref = push(socket, "ping", %{})
      reply = %{ping: "pong"}

      assert_reply ref, :ok, ^reply
    end
  end
end
