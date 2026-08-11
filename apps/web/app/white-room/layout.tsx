export default function WhiteRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // WHITE ROOM has its own minimal layout - no navigation, vast white space
  return <>{children}</>;
}
