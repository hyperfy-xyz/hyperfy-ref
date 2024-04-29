export function Analytics() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <script
        defer
        data-domain='hypex.xyz'
        src='https://plausible.io/js/script.js'
      />
    )
  }
}
