defmodule HelloSockets.Pipeline.Worker do

  def start_link(item) do
    Task.start_link(fn ->
      process(item)
    end)
  end

  defp process(%{item: %{data: data, user_id: user_id}}) do
    Process.sleep(1000)
    HelloSocketsWeb.Endpoint.broadcast!("user:#{user_id}", "push", data)
  end
end
