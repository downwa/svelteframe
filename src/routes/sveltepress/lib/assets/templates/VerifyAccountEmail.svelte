<script lang="ts">
  import { Html, Text, Button } from 'svelte-email';
  export let user;
  export let verifyUrl;
</script>

<Html lang="en">
  <body>
    <Text>Hello {user.displayName},</Text>
    <Text>
      Thank you for signing up with SveltePress! Please confirm your email:
    </Text>
    <Button href={verifyUrl}>Verify Email Address</Button>
    <Text>
      This link expires in 5 days. If you didn't create this account, you can ignore this email.
    </Text>
  </body>
</Html>
