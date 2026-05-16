export default function Leaked() {
  return <p>{process.env.NEXT_PUBLIC_STRIPE_SECRET}</p>;
}
