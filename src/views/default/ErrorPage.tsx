export function ErrorPage(props: { status: number; message: string }) {
  return (
    <div class="cg-error">
      <title>{`Error ${props.status}`}</title>
      <h2>Error {props.status}</h2>
      <div class="cg-alert" role="alert">
        {props.message}
      </div>
    </div>
  );
}
