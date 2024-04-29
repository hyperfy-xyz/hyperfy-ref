import { Header } from '@/components/Header'
import { Meta } from '@/components/Meta'
import { Link } from 'firebolt'

export default function Home() {
  return (
    <>
      <Header />
      <div css='padding-top:100px'>
        <div>Home</div>
        <div>
          <Link href='/123'>Space 123</Link>
        </div>
      </div>
      <Meta
        title='Firebolt'
        description='The Effortless React Framework.'
        image='/og-default.png'
        root
      />
    </>
  )
}
