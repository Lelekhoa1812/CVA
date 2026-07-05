import ExperienceLocationInjector from "@/components/profile/ExperienceLocationInjector";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ExperienceLocationInjector />
    </>
  );
}
