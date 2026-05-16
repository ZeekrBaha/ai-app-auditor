export default function HomePage() {
  const name = process.env.NEXT_PUBLIC_APP_NAME ?? 'App';
  return <h1>{name}</h1>;
}
