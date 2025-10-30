<script lang="ts">
  import type { HeroSlide } from '../_pubcomponents/Hero.types';
  import HeroStatic from '../_pubcomponents/HeroStatic.svelte';
  import headerImg1 from '../lib/assets/images/alaska_droneA_6.webp';
  import headerImg2 from '../lib/assets/images/alaska_droneA_6-p-2000.webp';
  import headerImg3 from '../lib/assets/images/alaska_droneA_6-p-1600.webp';
  import headerImg4 from '../lib/assets/images/alaska_droneA_6-p-1080.webp';
  import headerImg5 from '../lib/assets/images/alaska_droneA_6-p-800.webp';
  import headerImg6 from '../lib/assets/images/alaska_droneA_6-p-500.webp';
  
  const heroSlidesData: HeroSlide[] = [
    {
      bgImageSrc: headerImg1,
      bgImageSet: [
        { src: headerImg1, minWidth: 2001 },
        { src: headerImg2, minWidth: 1601 },
        { src: headerImg3, minWidth: 1081 },
        { src: headerImg4, minWidth: 801 },
        { src: headerImg5, minWidth: 501 },
        { src: headerImg6, minWidth: 0 },
      ],
      bgImageAlt:
        'An overview of Lake Nunavaugaluk, with mountains in the background',
      headingPhrase: 'SveltePress Setup',
      subText: 'Configure your SveltePress instance',
      buttonText: '',
      buttonLink: '',
      progressText: '',
    },
  ];
  const heroTitlePrefix = '';

  let email = '';
  let file: string | Blob | null = null;

  // Additional config variables bound to inputs
  let mail_server = 'smtp.office365.com';
  let mail_port = '587';
  let mail_user = '';
  let mail_pass = '';
  let email_from_address = '';
  let admin_display_name = '';
  let rpid = 'localhost';
  let originport = '5173';
  let origin = 'http://localhost:5173';

  let status = '';

  const CONFIRMATION_FILE = '0-SveltePress-Admin.confirm';

  async function handleSubmit(event: { preventDefault: () => void; }) {
    event.preventDefault();

    if (!file) {
      status = 'Please upload the confirmation file.';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('email', email);

    formData.append('MAIL_SERVER', mail_server);
    formData.append('MAIL_PORT', mail_port);
    formData.append('MAIL_USER', mail_user);
    formData.append('MAIL_PASS', mail_pass);
    formData.append('EMAIL_FROM_ADDRESS', email_from_address);
    formData.append('ADMIN_DISPLAY_NAME', admin_display_name);
    formData.append('RPID', rpid);
    formData.append('ORIGINPORT', originport);
    formData.append('ORIGIN', origin);

    const response = await fetch('/sveltepress/setup/confirm', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    status = result.message;
  }
</script>

<HeroStatic slides={heroSlidesData} staticHeadingText={heroTitlePrefix} />

<div class="sveltepress">

  <h1>Confirm your admin registration to complete the setup.</h1>
  <p>
    An admin confirmation file, named
    <strong style="color: green;">{CONFIRMATION_FILE}</strong>,
    has been generated and placed in your project root.<br />
    Please upload the confirmation file and provide the requested information below.
  </p>

  <form on:submit|preventDefault={handleSubmit} enctype="multipart/form-data" method="post" novalidate>

<table>
  <tbody>
    <tr>
      <td><label for="fileInput">Upload Confirmation File *</label></td>
      <td>
        <input 
          id="fileInput" 
          type="file" 
          required 
          accept=".confirm"
          on:change={e => {
            const input = e.target as HTMLInputElement | null;
            file = input && input.files && input.files.length > 0 ? input.files[0] : null;
          }} 
        />
        <br />
        <small style="color:#555; font-style: italic;">The admin confirmation file previously generated.</small>
      </td>
    </tr>

    <tr>
      <td><label for="emailInput">Admin Email *</label></td>
      <td>
        <input id="emailInput" type="email" bind:value={email} required placeholder="email@domain.com" />
        <br />
        <small style="color:#555; font-style: italic;">Email address of the site administrator.</small>
      </td>
    </tr>

    <tr>
      <td><label for="mailServerInput">MAIL_SERVER</label></td>
      <td>
        <input 
          id="mailServerInput" 
          type="text" 
          bind:value={mail_server} 
          placeholder="smtp.office365.com" 
          spellcheck="false"
          autocomplete="off"
        />
        <br />
        <small style="color:#555; font-style: italic;">
          SMTP server address (e.g., smtp.office365.com)
        </small>
      </td>
    </tr>

    <tr>
      <td><label for="mailPortInput">MAIL_PORT</label></td>
      <td>
        <input 
          id="mailPortInput" 
          type="number" 
          bind:value={mail_port} 
          placeholder="587" 
          min="1" max="65535"
          autocomplete="off"
        />
        <br />
        <small style="color:#555; font-style: italic;">
          Port number for the SMTP server (usually 587).
        </small>
      </td>
    </tr>

    <tr>
      <td><label for="mailUserInput">MAIL_USER</label></td>
      <td>
        <input 
          id="mailUserInput" 
          type="text" 
          bind:value={mail_user} 
          placeholder="SMTP username" 
          autocomplete="username"
        />
        <br />
        <small style="color:#555; font-style: italic;">
          Username for SMTP authentication.
        </small>
      </td>
    </tr>

    <tr>
      <td><label for="mailPassInput">MAIL_PASS</label></td>
      <td>
        <input 
          id="mailPassInput" 
          type="password" 
          bind:value={mail_pass} 
          placeholder="SMTP password" 
          autocomplete="current-password"
        />
        <br />
        <small style="color:#555; font-style: italic;">
          Password for SMTP authentication.
        </small>
      </td>
    </tr>

    <tr>
      <td><label for="emailFromInput">EMAIL_FROM_ADDRESS</label></td>
      <td>
        <input 
          id="emailFromInput" 
          type="email" 
          bind:value={email_from_address} 
          placeholder="Leave blank to match MAIL_USER" 
          autocomplete="email"
        />
        <br />
        <small style="color:#555; font-style: italic;">
          The 'From' email address for outgoing mails. Optional.
        </small>
      </td>
    </tr>

    <tr>
      <td><label for="adminDisplayNameInput">ADMIN_DISPLAY_NAME</label></td>
      <td>
        <input 
          id="adminDisplayNameInput" 
          type="text" 
          bind:value={admin_display_name} 
          placeholder="e.g. Admin User (optional)" 
          autocomplete="name"
        />
        <br />
        <small style="color:#555; font-style: italic;">
          Display name of the admin user (optional).
        </small>
      </td>
    </tr>

    <tr>
      <td><label for="rpidInput">RPID</label></td>
      <td>
        <input 
          id="rpidInput" 
          type="text" 
          bind:value={rpid} 
          placeholder="localhost" 
          autocomplete="off"
        />
        <br />
        <small style="color:#555; font-style: italic;">
          Site domain or 'localhost' (users will be able to login with Passkeys).
        </small>
      </td>
    </tr>

    <tr>
      <td><label for="originPortInput">ORIGINPORT</label></td>
      <td>
        <input 
          id="originPortInput" 
          type="text" 
          bind:value={originport} 
          placeholder="3000 or 5173" 
          autocomplete="off"
        />
        <br />
        <small style="color:#555; font-style: italic;">
          Port the site runs on (e.g., 3000 for production).
        </small>
      </td>
    </tr>

    <tr>
      <td><label for="originInput">ORIGIN</label></td>
      <td>
        <input 
          id="originInput" 
          type="url" 
          bind:value={origin} 
          placeholder="http://localhost:5175 or https://yourdomain.com" 
          autocomplete="off"
        />
        <br />
        <small style="color:#555; font-style: italic;">
          Public-facing base URL, needed for correct server-side links.
        </small>
      </td>
    </tr>
  </tbody>
</table>


    <br />
    <button type="submit">Confirm &amp; Register Admin</button>
  </form>

  {#if status}
    <p style="margin-top: 1rem; font-weight: 600;">{status}</p>
  {/if}
</div>


<style>

button[type="submit"] {
  box-sizing: border-box;
  padding: 0.25rem 0.5rem;
  font-size: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}
input[type="url"] {
  width: 100%;
  box-sizing: border-box;
  padding: 0.25rem 0.5rem;
  font-size: 1rem;
  /* Remove any special browser styling for URL fields */
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.sveltepress {
  background-color: #789;
  min-height: 100vh; /* keep min height */
  padding: 30px;
  box-sizing: border-box; /* to include padding in size */
}

  /* Responsive table layout */
  table {
    width: 100%;
    max-width: 600px;
    border-collapse: collapse;
    margin-top: 1rem;
    box-sizing: border-box;
  }

  td {
    vertical-align: top;
    box-sizing: border-box;
  }

  label {
    font-weight: 600;
  }

  input[type="text"],
  input[type="email"],
  input[type="password"],
  input[type="file"],
  input[type="number"] {
    width: 100%;
    box-sizing: border-box;
    padding: 0.25rem 0.5rem;
    font-size: 1rem;
  }

  /* Stack inputs on narrow screens */
  @media (max-width: 600px) {
    table, tbody, tr, td {
      display: block;
      width: 100%;
    }
    td {
      padding: 0.25rem 0;
    }
  }
</style>
