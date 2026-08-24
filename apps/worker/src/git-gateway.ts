export async function requestGitGateway({
  request,
  gitGatewayUrl,
  originToken,
}: {
  request: Request;
  gitGatewayUrl: string;
  originToken: string;
}): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("authorization", `Basic ${btoa(`origin:${originToken}`)}`);

  const url = new URL(request.url);
  const gatewayUrl = new URL(gitGatewayUrl);
  url.protocol = gatewayUrl.protocol;
  url.host = gatewayUrl.host;

  console.info("Requesting Git gateway", {
    gitGatewayUrl,
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
    gitGatewayUrl,
    method: request.method,
    path: url.pathname,
    status: response.status,
  });
  return response;
}
