import GalleryHero from "@/components/gallery/GalleryHero";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main>
      <GalleryHero>
        <h1 id="gallery-title">ZA Gallery</h1>
        <p>
          Walk through the gallery: the material library, the textile wall, the gallery room, the vault and the exhibition hall. Scroll to move
          through the rooms.
        </p>
      </GalleryHero>

      <section id="galleries" className={styles.section}>
        <p className={styles.eyebrow}>Galleries</p>
        <h2 className={styles.title}>Five rooms, one continuous walk.</h2>
        <p className={styles.body}>
          Every room is open by appointment. Book a private viewing and our team will walk it with you.
        </p>
        <a className={styles.cta} href="#contact">
          Book a viewing
        </a>
      </section>
    </main>
  );
}
