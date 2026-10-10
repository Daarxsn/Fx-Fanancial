import Link from "next/link";
import { Icon } from "@/components/icon";

export default function NotFound() {
  return (
    <div className="system-state-page">
      <div className="system-state-page__mark"><Icon name="search" size={25} /></div>
      <p className="eyebrow">404 · NOT FOUND</p>
      <h1>This page isn’t here.</h1>
      <p>The address may be outdated, or this area may not be part of the current workspace.</p>
      <Link className="button button--primary" href="/">Return to overview</Link>
    </div>
  );
}
