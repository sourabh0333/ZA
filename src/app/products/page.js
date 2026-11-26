import ShowroomHero from "@/components/showroom/ShowroomHero";

export const metadata = {
  title: "Zigguratss — Products: art for every room",
  description:
    "Walk through a home in six rooms, a kitchen, a lounge, a living room, a games room, a bedroom and a bathroom, each with an original work from the Zigguratss collection.",
};

export default function Products() {
  return (
    <main>
      <ShowroomHero>
        <h1 id="showroom-title">Art for every room</h1>
        <p>
          Walk through a home: the kitchen, the lounge, the living room, the games room, the bedroom and the bathroom, each with original
          works from the Zigguratss collection. Scroll to move through the rooms; the eye on each work shows its details.
        </p>
      </ShowroomHero>
    </main>
  );
}
