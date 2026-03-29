import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Lista de correos permitidos
const allowedEmails = [
  "coordinadorbiomedica@hosusana.gov.co",
  "infraestructura@hosusana.gov.co",
  "serviciofarmaceutico@hosusana.gov.co",
  "jefecirugia@hosusana.gov.co",
  "jefeucia@hosusana.gov.co",
  "jefelaboratorio@hosusana.gov",
  "jefeucinucip@hosusana.gov.co",
  "jefeimagenesdx@hosusana.gov.co",
  "juanmanuel@microingenieria.net",
  "victor@microingenieria.net",
  "jose@microingenieria.net",
];

export const authOptions = {
  pages: {
    error: "/api/auth/error",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt", // Usamos JWT para sesiones sin base de datos
  },
  callbacks: {
    async signIn({ user }) {
      // Solo permitir usuarios con email autorizado
      //return allowedEmails.includes(user.email);
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.email = token.email;
      session.user.name = token.name;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
