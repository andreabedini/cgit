import { Layout } from "./Layout";

export function ErrorPage(props: { status: number; message: string }) {
  return (
    <Layout title={`Error ${props.status}`}>
      <h2>Error {props.status}</h2>
      <div class="terminal-alert terminal-alert-error" role="alert">
        {props.message}
      </div>
    </Layout>
  );
}
