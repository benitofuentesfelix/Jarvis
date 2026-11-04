export function Skeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="h-9 w-56 animate-pulse rounded-lg bg-s2" />
      <div className="h-28 animate-pulse rounded-[18px] bg-s1" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="h-72 animate-pulse rounded-[18px] bg-s1" />
        <div className="h-72 animate-pulse rounded-[18px] bg-s1" />
      </div>
    </div>
  );
}
