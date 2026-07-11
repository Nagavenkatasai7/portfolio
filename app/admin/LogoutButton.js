// A logout control for every admin page: a real same-origin form POST to
// /api/auth/logout (mutating, so the strict-sameSite cookie + Origin check
// apply). Server component — no client JS. `className` lets each page match its
// own button styling (the dashboard/adm pages vs. the X studio's terminal look).
export default function LogoutButton({ className = 'btn' }) {
  return (
    <form method="POST" action="/api/auth/logout" style={{ margin: 0 }}>
      <button className={className} type="submit">Log out</button>
    </form>
  );
}
