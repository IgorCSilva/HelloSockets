defmodule HelloSocketsWeb.WildcardChannel do
  use Phoenix.Channel

  def join("wild:" <> numbers, _payload, socket) do
    if numbers_correct?(numbers) do
      {:ok, socket}
    else
      {:error, %{}}
    end
  end

  def handle_in("ping", _payload, socket) do
    {:reply, {:ok, %{ping: "pong"}}, socket}
  end

  defp numbers_correct?(numbers) do
    numbers
    |> String.split(":")
    |> Enum.map(fn data ->
      case Float.parse(data) do
        {number, ""} -> number
        _ -> :error
      end
    end)
    |> case do
      [a, b] when b == a * 2 and is_number(a) and is_number(b) -> true
      _ -> false
    end
  end
end
