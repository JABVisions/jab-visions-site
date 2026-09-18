import {
  applySignedBoardAvatars,
  boardAvatarStoragePath,
  isSignedBoardAvatarUrl,
} from "./signBoardAvatars";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(
    isSignedBoardAvatarUrl(
      "https://abc.supabase.co/storage/v1/object/sign/board-avatars/user-1/avatar.jpg?token=secret"
    ),
    "signed object URLs are detected"
  );
  assert(
    !isSignedBoardAvatarUrl(
      "https://abc.supabase.co/storage/v1/object/public/board-avatars/user-1/avatar.jpg"
    ),
    "public object URLs are not treated as signed"
  );
  assert(
    boardAvatarStoragePath(
      "https://abc.supabase.co/storage/v1/object/public/board-avatars/user-1/avatar.jpg"
    ) === "user-1/avatar.jpg",
    "public avatar URLs yield a storage path"
  );
  assert(
    boardAvatarStoragePath(
      "https://abc.supabase.co/storage/v1/object/sign/board-avatars/user-1/avatar.jpg?token=secret"
    ) === "user-1/avatar.jpg",
    "signed avatar URLs yield a storage path"
  );
  assert(boardAvatarStoragePath("user-maya/avatar-77.jpg") === "user-maya/avatar-77.jpg", "raw paths pass through");
  assert(boardAvatarStoragePath("/assets/board-welcome-mark.jpg") === null, "local assets are not storage paths");

  const alreadySigned = [
    {
      avatarUrl:
        "https://abc.supabase.co/storage/v1/object/sign/board-avatars/user-1/avatar.jpg?token=keep-me",
    },
  ];
  const skipped = await applySignedBoardAvatars(
    {
      storage: {
        from() {
          throw new Error("should not resign a signed URL");
        },
      },
    } as any,
    alreadySigned
  );
  assert(skipped[0].avatarUrl?.includes("token=keep-me"), "already-signed avatars are left alone");

  const signed = await applySignedBoardAvatars(
    {
      storage: {
        from() {
          return {
            async createSignedUrls(paths: string[]) {
              return {
                data: paths.map((path) => ({
                  path,
                  signedUrl: `https://abc.supabase.co/storage/v1/object/sign/board-avatars/${path}?token=minted`,
                  error: null,
                })),
              };
            },
          };
        },
      },
    } as any,
    [
      { avatarUrl: "user-2/avatar.jpg" },
      {
        avatarUrl: "https://abc.supabase.co/storage/v1/object/public/board-avatars/user-3/avatar.jpg",
      },
    ]
  );
  assert(signed[0].avatarUrl?.includes("token=minted"), "raw avatar paths are signed");
  assert(signed[1].avatarUrl?.includes("token=minted"), "public avatar URLs are re-signed");

  console.log("board avatar signing checks passed");
}

void main();
