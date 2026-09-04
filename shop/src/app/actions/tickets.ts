"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { notifyAdmin } from "@/lib/telegram";
import { notifyUser } from "@/lib/notify";
import { displayName, saveAttachment } from "@/lib/uploads";

export type TicketState = { error?: string; success?: string };

/**
 * پیوست پیام تیکت.
 *
 * فایل اختیاری است: اگر کاربر چیزی انتخاب نکرده باشد، فرم یک File خالی
 * می‌فرستد و باید بی‌صدا رد شود؛ ولی فایل نامعتبر (نوع یا حجم) باید خطا بدهد
 * تا کاربر بفهمد پیوستش ثبت نشده است.
 */
async function readAttachment(
  formData: FormData,
): Promise<{ ok: true; file: { attachment: string; attachmentName: string } | null } | { ok: false; error: string }> {
  const file = formData.get("attachment");
  if (!(file instanceof File) || file.size === 0) return { ok: true, file: null };

  const saved = await saveAttachment(file);
  if (!saved.ok) return { ok: false, error: saved.error };
  return {
    ok: true,
    file: { attachment: saved.fileName, attachmentName: displayName(file.name) },
  };
}

export async function createTicketAction(_prev: TicketState, formData: FormData): Promise<TicketState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard%2Ftickets");

  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const serviceId = String(formData.get("serviceId") || "").trim();
  if (subject.length < 3) return { error: "موضوع تیکت را بنویسید." };
  if (body.length < 5) return { error: "متن پیام را کامل‌تر بنویسید." };

  // سرویس مرتبط باید متعلق به همین کاربر باشد
  let linkedService: string | null = null;
  if (serviceId) {
    const owned = await db.service.findFirst({ where: { id: serviceId, userId: user.id } });
    if (owned) linkedService = owned.id;
  }

  const attached = await readAttachment(formData);
  if (!attached.ok) return { error: attached.error };

  const ticket = await db.ticket.create({
    data: {
      userId: user.id,
      serviceId: linkedService,
      subject,
      messages: { create: { body, fromAdmin: false, ...(attached.file ?? {}) } },
    },
  });

  await notifyAdmin(
    `💬 <b>تیکت جدید</b>\nموضوع: ${subject}\nکاربر: ${user.email}\n` +
      `${attached.file ? `📎 پیوست: ${attached.file.attachmentName}\n` : ""}\n${body.slice(0, 300)}\n\n` +
      `برای پاسخ، همین پیام را ریپلای کنید یا بنویسید:\n<code>/reply ${ticket.id} متن پاسخ</code>\n#T${ticket.id}`,
    "ticket",
  );

  redirect(`/dashboard/tickets/${ticket.id}`);
}

export async function replyTicketAction(_prev: TicketState, formData: FormData): Promise<TicketState> {
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };

  const ticketId = String(formData.get("ticketId") || "");
  const body = String(formData.get("body") || "").trim();
  const hasFile = formData.get("attachment") instanceof File && (formData.get("attachment") as File).size > 0;
  // با پیوست، متن کوتاه هم قابل قبول است؛ بدون پیوست پیام خالی معنا ندارد
  if (body.length < 2 && !hasFile) return { error: "متن پیام خالی است." };

  const isAdmin = isStaff(user.role);
  const ticket = await db.ticket.findFirst({
    where: isAdmin ? { id: ticketId } : { id: ticketId, userId: user.id },
    include: { user: true },
  });
  if (!ticket) return { error: "تیکت پیدا نشد." };
  if (ticket.status === "closed") return { error: "این تیکت بسته شده است." };

  const attached = await readAttachment(formData);
  if (!attached.ok) return { error: attached.error };

  await db.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      body: body || (attached.file ? `📎 ${attached.file.attachmentName}` : ""),
      fromAdmin: isAdmin,
      ...(attached.file ?? {}),
    },
  });
  await db.ticket.update({
    where: { id: ticket.id },
    data: { status: isAdmin ? "answered" : "open", updatedAt: new Date() },
  });

  if (isAdmin) {
    await notifyUser({
      userId: ticket.userId,
      kind: "ticket_reply",
      title: "پشتیبانی به تیکت شما پاسخ داد",
      body: `${ticket.subject}: ${body.slice(0, 120)}${attached.file ? " 📎" : ""}`,
      href: `/dashboard/tickets/${ticket.id}`,
    });
  }

  if (!isAdmin) {
    await notifyAdmin(
      `💬 <b>پاسخ جدید</b> روی تیکت «${ticket.subject}»\nاز: ${ticket.user.email}\n` +
        `${attached.file ? `📎 پیوست: ${attached.file.attachmentName}\n` : ""}\n${body.slice(0, 300)}\n\n` +
        `پاسخ سریع: ریپلای کنید یا <code>/reply ${ticket.id} متن</code>\n#T${ticket.id}`,
      "ticket",
    );
  }

  revalidatePath(`/dashboard/tickets/${ticket.id}`);
  revalidatePath(`/admin/tickets/${ticket.id}`);
  return { success: attached.file ? "پیام و پیوست شما ثبت شد." : "پیام شما ثبت شد." };
}

export async function closeTicketAction(_prev: TicketState, formData: FormData): Promise<TicketState> {
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };
  const ticketId = String(formData.get("ticketId") || "");

  const ticket = await db.ticket.findFirst({
    where: isStaff(user.role) ? { id: ticketId } : { id: ticketId, userId: user.id },
  });
  if (!ticket) return { error: "تیکت پیدا نشد." };

  await db.ticket.update({ where: { id: ticket.id }, data: { status: "closed" } });
  revalidatePath(`/dashboard/tickets/${ticket.id}`);
  revalidatePath(`/admin/tickets/${ticket.id}`);
  return { success: "تیکت بسته شد." };
}
