import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { UserTable } from "@/components/admin/user-table";
import { UserInviteForm } from "@/components/admin/user-invite-form";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

export function AdminUsersPage() {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="User Management"
        description="Add, remove, and manage user access for this site"
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        }
      />

      <UserTable />
      <UserInviteForm open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
