export function LoadingState({ what }: { what: string }) {
  return (
    <p role="status" className="text-sm text-[#3d4148] m-0">
      Validating {what}…
    </p>
  );
}

export function ErrorState({
  message,
  recovery,
}: {
  message: string;
  recovery: string;
}) {
  return (
    <div role="alert" className="text-sm m-0">
      <p className="m-0 mb-1 font-semibold text-[#b91c1c]">{message}</p>
      <p className="m-0 text-[#3d4148]">Recovery: {recovery}</p>
    </div>
  );
}

export function EmptyState({ children }: { children: string }) {
  return <p className="text-sm text-[#5b6068] m-0">{children}</p>;
}
