export function handoffErrorMessage(code: string): string {
  switch (code) {
    case "VISION_UNAVAILABLE":
      return "Таних систем түр тасарсан. Энэ ээлж оноонд нөлөөлөхгүй, дахин оролдоно уу.";
    case "INVALID_FRAME":
      return "Камерын дүрс бэлэн болсонгүй. Камераа хөдөлгөхгүй бариад дахин оролдоно уу.";
    case "TURN_EXPIRED":
      return "Ээлжийн хугацаа сервер дээр дууссан. Дахин оролдоно уу.";
    case "UNAUTHORIZED":
      return "Төхөөрөмжийн session дууссан. Тоглоомоо дахин эхлүүлнэ үү.";
    default:
      return "Тоглоомын backend түр боломжгүй байна. Дахин оролдоно уу.";
  }
}
