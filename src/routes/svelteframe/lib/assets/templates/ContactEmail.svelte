<script lang="ts">
  import { Html, Text, Button } from 'svelte-email';
  //export let user;
  export let message: {
    date: string;
    firstName: string;
    lastName: string;
    fullName?: string;
    email: string;
    phone: string;
    topic: string; // "General Inquiry", "Land Department", etc.
    department?: string;
    body: string;
  };
</script>

<Html lang="en">
  <body>
    <Text>
    <h2>New contact form submission</h2>

    <p>
    A new contact message was submitted from the website on
    <strong>{message.date}</strong>.
    </p>

    <h3>Contact details</h3>
    <ul>
    <li><strong>Name:</strong> {message.fullName || `${message.firstName} ${message.lastName}`}</li>
    <li><strong>Email:</strong> {message.email}</li>
    <li><strong>Phone:</strong> {message.phone}</li>
    <li><strong>Topic / Department:</strong> {message.department || message.topic}</li>
    </ul>

    <h3>Message</h3>
    <p style="white-space: pre-wrap;">
    {message.body}
    </p>
    </Text>
  </body>
</Html>
