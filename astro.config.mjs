// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://opennow.zortos.me',
	integrations: [
		starlight({
			title: 'OpenNOW',
			description: 'Open source GeForce NOW client built in Native Rust',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/zortos293/OpenNOW' },
				{ icon: 'discord', label: 'Discord', href: 'https://discord.gg/8EJYaJcNfD' }
			],
			sidebar: [
				{
					label: 'Guides',
					items: [
						{ label: 'Getting Started', slug: 'guides/getting-started' },
					],
				},
				{
					label: 'Architecture',
					items: [
						{ label: 'Overview', slug: 'architecture/overview' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Authentication', slug: 'reference/authentication' },
						{ label: 'WebRTC', slug: 'reference/webrtc' },
						{ label: 'Media Pipeline', slug: 'reference/media' },
						{ label: 'Input System', slug: 'reference/input' },
						{ label: 'Configuration', slug: 'reference/configuration' },
					],
				},
			],
			customCss: [
				// './src/styles/custom.css',
			],
		}),
	],
});
