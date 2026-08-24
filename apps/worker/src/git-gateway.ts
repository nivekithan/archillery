export async function requestGitGateway({
  request,
  gitGatewayHost,
  originToken,
}: {
  request: Request;
  gitGatewayHost: string;
  originToken: string;
}): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("authorization", `Basic ${btoa(`origin:${originToken}`)}`);

  const url = new URL(request.url);
  url.protocol = "https:";
  url.hostname = gitGatewayHost;
  url.port = "";

  console.info("Requesting Git gateway", {
    gitGatewayHost,
    method: request.method,
    path: url.pathname,
  });

  const response = await fetch(
    new Request(url, {
      body: request.body,
      headers,
      method: request.method,
      redirect: "manual",
    }),
  );
  console.info("Git gateway responded", {
    gitGatewayHost,
    method: request.method,
    path: url.pathname,
    status: response.status,
  });
  return response;
}
