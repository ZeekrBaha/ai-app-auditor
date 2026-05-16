export default function Home() {
  const url = process.env.DATABASE_URL;
  const name = process.env.UNDOCUMENTED_VAR;
  return <pre>{url}{name}</pre>;
}
