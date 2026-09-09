import Navbar from "../components/Navbar";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="site-content">{children}</div>
    </>
  );
}
