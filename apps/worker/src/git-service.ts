export async function requestGitService({
  request,
  gitHost,
  originToken,
}: {
  request: Request;
  gitHost: string;
  originToken: string;
}): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("authorization", `Basic ${btoa(`origin:${originToken}`)}`);

  const url = new URL(request.url);
  url.protocol = "https:";
  url.hostname = gitHost;
  url.port = "";

  console.info("Requesting Git service", {
    gitHost,
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
  console.info("Git service responded", {
    gitHost,
    method: request.method,
    path: url.pathname,
    status: response.status,
  });
  return response;
}
