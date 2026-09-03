import {expect,test} from "@playwright/test";
test("Demo explains Work Area QR, Task Master, and Schedule Master safely",async({page})=>{
 await page.goto("/demo");
 await expect(page.getByText("WORK AREA + QR DEMO")).toBeVisible();await expect(page.getByText("Reprint",{exact:true})).toBeVisible();await expect(page.getByText("Regenerate",{exact:true})).toBeVisible();await expect(page.getByText(/QR never grants authorization/)).toBeVisible();
 await expect(page.getByText("TASK MASTER DEMO")).toBeVisible();await expect(page.getByRole("heading",{name:"Reusable Organization-level Tasks"})).toBeVisible();await expect(page.getByRole("heading",{name:"Clean main entrance glass"})).toBeVisible();const firstTask=page.getByRole("article").filter({hasText:"Clean main entrance glass"});await expect(firstTask.getByText(/no Base64 media/i)).toBeVisible();await expect(page.getByText(/USER is read-only/i)).toBeVisible();
 await expect(page.getByText("SCHEDULE MASTER DEMO")).toBeVisible();await expect(page.getByRole("heading",{name:"One Work Area, ordered Tasks, preserved local intent"})).toBeVisible();await expect(page.getByText("Morning Lobby Readiness")).toBeVisible();await expect(page.getByText(/deterministic 1-in-N subset/i)).toBeVisible();await expect(page.getByText(/Occurrence generation, claiming, QR start/i)).toBeVisible();
});
