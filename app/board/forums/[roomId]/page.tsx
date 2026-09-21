"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import RoomInterior from "@/app/components/board/rooms/RoomInterior";

function ForumRoomPageInner({ roomId }: { roomId: string }) {
  const search = useSearchParams();
  const conversation = search.get("conversation") || search.get("thread");
  return <RoomInterior roomId={roomId} conversationId={conversation} />;
}

export default function ForumRoomPage({ params }: { params: { roomId: string } }) {
  return (
    <div className="min-h-screen w-full text-white">
      <Suspense fallback={<div className="min-h-screen w-full text-white" />}>
        <ForumRoomPageInner roomId={params.roomId} />
      </Suspense>
    </div>
  );
}
