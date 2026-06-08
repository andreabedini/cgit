export function ErrorPage(props: { status: number; message: string }) {
  return (
    <>
      <title>{`Error ${props.status}`}</title>
      <h2>Error {props.status}</h2>
      <div class="terminal-alert terminal-alert-error" role="alert">
        {props.message}
      </div>
    </>
  );
}
