import { Layout } from "./Layout";

export function ErrorPage(props: { status: number; message: string }) {
  return (
    <Layout title={`Error ${props.status}`}>
      <div class="error">
        <h2>{props.status}</h2>
        <p>{props.message}</p>
      </div>
    </Layout>
  );
}
