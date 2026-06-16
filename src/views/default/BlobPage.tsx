import { Breadcrumb } from "./Breadcrumb";

export interface BlobProps {
  name: string;
  ref: string;
  path: string;
  binary: boolean;
  text?: string;   // present when !binary
  size: number;
}

export function BlobPage(props: BlobProps) {
  const rawHref = `/${props.name}/raw/${props.ref}/${props.path}`;
  return (
    <>
      <title>{`${props.name}: ${props.path}`}</title>
      <Breadcrumb name={props.name} ref={props.ref} path={props.path} />
      <p>
        <a href={rawHref}>raw</a> &middot; {props.size} bytes
      </p>
      {props.binary ? (
        <p class="binary">Binary file not shown.</p>
      ) : (
        <table class="blob">
          <tbody>
            {(props.text ?? "").split("\n").map((line, i) => (
              <tr>
                <td class="lineno">{i + 1}</td>
                <td>
                  <pre>{line}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
