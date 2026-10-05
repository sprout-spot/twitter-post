import { SproutAPI } from "sprout.spot";
import { Rettiwt } from "rettiwt-api";
import { readFile, writeFile } from "node:fs/promises";

const twitterApi = new Rettiwt({ apiKey: process.env.RETTIWT_KEY! });
const sproutApi = new SproutAPI(process.env.BOT_TOKEN!);

const [twitterUser, sproutUser] = await Promise.all([
  twitterApi.user.details(),
  sproutApi.ProfileService.getAuthenticatedUser(),
]);

if (!twitterUser) throw new Error("twitter login failed!");
else if (!sproutUser?.[0]) throw new Error("sprout login failed!");

console.log(`logged in on twitter as ${twitterUser.userName}`);
console.log(`logged in on sprout as ${sproutUser[0].username}`);

const targetUserId = (await twitterApi.user.details(process.env.TARGET_USER!))
  ?.id;

if (!targetUserId)
  throw new Error(`failed to get user id for ${process.env.TARGET_USER!}`);
else
  console.log(`got user id for ${process.env.TARGET_USER}! - ${targetUserId}`);

let lastId = "";

try {
  lastId = (await readFile(`last-post-${targetUserId}.txt`))?.toString("utf8");
} catch {
  // eh who cares
}

async function poll() {
  console.log("looking for new tweets...");

  try {
    const { list } = await twitterApi.user.timeline(targetUserId, 5);
    const tweet = list[0];

    if (tweet && tweet.id !== lastId) {
      console.log("new post:", tweet.fullText, tweet.createdAt);

      lastId = tweet.id;
      await writeFile(`last-post-${targetUserId}.txt`, tweet.id);

      const media = tweet.media ?? [];
      const text = media.length
        ? tweet.fullText.replace(/\s*https:\/\/t\.co\/\w+$/, "")
        : tweet.fullText;

      const images = await Promise.all(
        media
          .filter((m) => m.type === "PHOTO")
          .map(async (m, i) => {
            const res = await fetch(`${m.url}?name=orig`);
            if (!res.ok)
              throw new Error(`failed to download ${m.url}: ${res.status}`);

            // ok, let's upload that... (twitter stores images as jpegs)
            return sproutApi.UploadsService.uploadPostImage(
              await res.blob(),
              `${tweet.id}_${i}.jpg`,
            );
          }),
      );

      // cool, let's post it!

      const post = await sproutApi.PostsService.makePost({
        message: text,
        images,
        circle_id: `o-${process.env.DESIRED_ROOT!}`,
        orbit_ids: [process.env.DESIRED_ROOT!],
      });
      
      console.log(`posted on sprout: https://sprout.spot/post/${post.post_id}`)
    } else {
      console.log("no new ones... yet!")
    }
  } catch (e) {
    console.log(e);
  }
}

await poll();
setInterval(poll, 60_000);
