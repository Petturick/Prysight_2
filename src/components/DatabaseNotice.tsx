export function DatabaseNotice() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Database tijdelijk niet bereikbaar</p>
      <p className="mt-1">Dit scherm blijft beschikbaar, maar toont geen waarden en wijzigingen zijn tijdelijk uitgeschakeld.</p>
    </div>
  )
}
