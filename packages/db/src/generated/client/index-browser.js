
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.AccountScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  type: 'type',
  provider: 'provider',
  providerAccountId: 'providerAccountId',
  refresh_token: 'refresh_token',
  access_token: 'access_token',
  expires_at: 'expires_at',
  token_type: 'token_type',
  scope: 'scope',
  id_token: 'id_token',
  session_state: 'session_state'
};

exports.Prisma.SessionScalarFieldEnum = {
  id: 'id',
  sessionToken: 'sessionToken',
  userId: 'userId',
  expires: 'expires'
};

exports.Prisma.VerificationTokenScalarFieldEnum = {
  identifier: 'identifier',
  token: 'token',
  expires: 'expires'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  emailVerified: 'emailVerified',
  name: 'name',
  image: 'image',
  role: 'role',
  plan: 'plan',
  planExpiresAt: 'planExpiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ResumeScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  title: 'title',
  isDefault: 'isDefault',
  content: 'content',
  rawText: 'rawText',
  fileUrl: 'fileUrl',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CoverLetterTemplateScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  title: 'title',
  body: 'body',
  isDefault: 'isDefault',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserSkillScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  name: 'name',
  category: 'category',
  proficiency: 'proficiency'
};

exports.Prisma.PortfolioItemScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  title: 'title',
  url: 'url',
  fileUrl: 'fileUrl',
  categories: 'categories',
  createdAt: 'createdAt'
};

exports.Prisma.JobScalarFieldEnum = {
  id: 'id',
  externalId: 'externalId',
  source: 'source',
  title: 'title',
  company: 'company',
  location: 'location',
  salaryMin: 'salaryMin',
  salaryMax: 'salaryMax',
  currency: 'currency',
  isRemote: 'isRemote',
  jobType: 'jobType',
  description: 'description',
  requirements: 'requirements',
  applyUrl: 'applyUrl',
  postedAt: 'postedAt',
  closingDate: 'closingDate',
  industry: 'industry',
  companySize: 'companySize',
  duplicateOf: 'duplicateOf',
  createdAt: 'createdAt'
};

exports.Prisma.SavedSearchScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  name: 'name',
  filters: 'filters',
  notifyEmail: 'notifyEmail',
  notifyPush: 'notifyPush',
  frequency: 'frequency',
  lastRunAt: 'lastRunAt',
  createdAt: 'createdAt'
};

exports.Prisma.CompanyWatchlistScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  companyName: 'companyName',
  careerUrl: 'careerUrl',
  lastChecked: 'lastChecked',
  createdAt: 'createdAt'
};

exports.Prisma.JobApplicationScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  jobId: 'jobId',
  resumeId: 'resumeId',
  coverLetterId: 'coverLetterId',
  status: 'status',
  appliedAt: 'appliedAt',
  followUpDate: 'followUpDate',
  recruiterName: 'recruiterName',
  recruiterEmail: 'recruiterEmail',
  recruiterPhone: 'recruiterPhone',
  notes: 'notes',
  matchScore: 'matchScore',
  salary: 'salary',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ApplicationLogScalarFieldEnum = {
  id: 'id',
  applicationId: 'applicationId',
  action: 'action',
  detail: 'detail',
  createdAt: 'createdAt'
};

exports.Prisma.InterviewScalarFieldEnum = {
  id: 'id',
  applicationId: 'applicationId',
  scheduledAt: 'scheduledAt',
  type: 'type',
  notes: 'notes',
  outcome: 'outcome',
  createdAt: 'createdAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  type: 'type',
  title: 'title',
  body: 'body',
  isRead: 'isRead',
  link: 'link',
  createdAt: 'createdAt'
};

exports.Prisma.UserIntegrationScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  provider: 'provider',
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  expiresAt: 'expiresAt',
  scope: 'scope',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ResumeABTestScalarFieldEnum = {
  id: 'id',
  resumeId: 'resumeId',
  group: 'group',
  isActive: 'isActive',
  createdAt: 'createdAt'
};

exports.Prisma.StarStoryScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  title: 'title',
  situation: 'situation',
  task: 'task',
  action: 'action',
  result: 'result',
  competencies: 'competencies',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};


exports.Prisma.ModelName = {
  Account: 'Account',
  Session: 'Session',
  VerificationToken: 'VerificationToken',
  User: 'User',
  Resume: 'Resume',
  CoverLetterTemplate: 'CoverLetterTemplate',
  UserSkill: 'UserSkill',
  PortfolioItem: 'PortfolioItem',
  Job: 'Job',
  SavedSearch: 'SavedSearch',
  CompanyWatchlist: 'CompanyWatchlist',
  JobApplication: 'JobApplication',
  ApplicationLog: 'ApplicationLog',
  Interview: 'Interview',
  Notification: 'Notification',
  UserIntegration: 'UserIntegration',
  ResumeABTest: 'ResumeABTest',
  StarStory: 'StarStory'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
