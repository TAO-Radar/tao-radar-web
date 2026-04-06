import { useChainId, useLazyLoadQuery } from "@reactive-dot/react";

export function ChainPage() {
  const chainId = useChainId();

  const [timestamp, blockNumber] = useLazyLoadQuery((builder) =>
    builder.storage("Timestamp", "Now").storage("System", "Number"),
  );

  return (
    <>
      <h1>Your app is ready</h1>
      <p className="m-2">
        Connected to chain <strong>{chainId}</strong>
      </p>
      <p className="m-2">
        Current block is <strong>{blockNumber.toString()}</strong>
      </p>
      <p className="m-2">
        Timestamp: <strong>{timestamp.toString()}</strong>
      </p>
    </>
  );
}
