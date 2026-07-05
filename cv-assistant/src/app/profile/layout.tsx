import ProfileLocationEditor from "@/components/profile/ProfileLocationEditor";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ProfileLocationEditor />
    </>
  );
}
