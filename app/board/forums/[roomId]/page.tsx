"use client";

import RoomInterior from "@/app/components/board/rooms/RoomInterior";

export default function ForumRoomPage({ params }: { params: { roomId: string } }) {
  return (
    <div className="min-h-screen w-full text-white">
      <RoomInterior roomId={params.roomId} />
    </div>
  );
}
