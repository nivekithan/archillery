export async function requestGitGateway({
  request,
  gatewayFetch,
}: {
  request: Request;
  gatewayFetch: (request: Request) => Promise<Response>;
}): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("authorization");

  const url = new URL(request.url);

  console.info("Requesting Git gateway", {
    method: request.method,
    path: url.pathname,
  });

  const response = await gatewayFetch(
    new Request(url, {
      body: request.body,
      headers,
      method: request.method,
      redirect: "manual",
    }),
  );
  console.info("Git gateway responded", {
    method: request.method,
    path: url.pathname,
    status: response.status,
  });
  return response;
}
