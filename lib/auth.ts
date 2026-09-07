import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "workspace";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      credentials: {
        name: { label: "Name", type: "text" },
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const email = parsed.data.email.toLowerCase();
        const name = parsed.data.name?.trim() || email.split("@")[0];

        const user = await prisma.$transaction(async (tx) => {
          const user = await tx.user.upsert({
            where: {
              email,
            },
            update: {
              email,
              name,
            },
            create: {
              email,
              name,
            },
          });

          const organization = await tx.organization.findFirst({
            where: {
              OR: [
                { ownerId: user.id },
                {
                  members: {
                    some: {
                      id: user.id,
                    },
                  },
                },
              ],
            },
            include: {
              workspaces: {
                where: {
                  OR: [
                    { leadId: user.id },
                    {
                      members: {
                        some: {
                          id: user.id,
                        },
                      },
                    },
                  ],
                },
                take: 1,
              },
            },
          });

          if (!organization) {
            const organizationName = `${name}'s Organization`;

            await tx.organization.create({
              data: {
                name: organizationName,
                slug: `${slugify(organizationName)}-${user.id.slice(0, 8)}`,
                ownerId: user.id,
                members: {
                  connect: {
                    id: user.id,
                  },
                },
                workspaces: {
                  create: {
                    name: "Default Workspace",
                    slug: "default-workspace",
                    leadId: user.id,
                    members: {
                      connect: {
                        id: user.id,
                      },
                    },
                  },
                },
              },
            });

            return user;
          }

          await tx.organization.update({
            where: {
              id: organization.id,
            },
            data: {
              members: {
                connect: {
                  id: user.id,
                },
              },
            },
          });

          if (organization.workspaces.length === 0) {
            await tx.workspace.create({
              data: {
                name: "Default Workspace",
                slug: `default-workspace-${user.id.slice(0, 8)}`,
                organizationId: organization.id,
                leadId: user.id,
                members: {
                  connect: {
                    id: user.id,
                  },
                },
              },
            });
          }

          return user;
        });

        return {
          id: user.id,
          email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = String(token.id);
      }

      return session;
    },
  },
});
